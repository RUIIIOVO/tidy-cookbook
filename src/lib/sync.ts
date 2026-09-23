"use client";

/**
 * 点菜单的跨设备同步。离线优先：
 *   本地先改（乐观更新）→ 进 outbox → WS 发出（转 inflight）→ 服务端广播快照 → 覆盖本地。
 * 断网照常加菜，重连后 outbox 自动回放；掉线时 inflight 退回 outbox 重发。
 */

import { setOpSink, useCart, type CartItem } from "./store";

export type SyncStatus = "offline" | "connecting" | "online";
type Listener = (s: SyncStatus) => void;

const HEARTBEAT_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

let ws: WebSocket | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let status: SyncStatus = "offline";
const listeners = new Set<Listener>();

function setStatus(s: SyncStatus) {
  if (status === s) return;
  status = s;
  for (const fn of listeners) fn(s);
}

export function onSyncStatus(fn: Listener): () => void {
  listeners.add(fn);
  fn(status);
  return () => void listeners.delete(fn);
}

export const getSyncStatus = () => status;

function flush() {
  if (ws?.readyState !== WebSocket.OPEN) return;
  for (const op of useCart.getState().takeOutbox()) ws.send(JSON.stringify(op));
}

export function connect() {
  if (typeof window === "undefined") return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING))
    return;

  setStatus("connecting");
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const sock = new WebSocket(`${proto}//${location.host}/api/sync`);
  ws = sock;

  sock.onopen = () => {
    attempt = 0;
    setStatus("online");
    flush();
    // 心跳由 DO 的 setWebSocketAutoResponse("ping","pong") 在平台层应答，
    // 不唤醒 Durable Object，也就不消耗 100k/天 的请求额度
    heartbeat = setInterval(() => {
      if (sock.readyState === WebSocket.OPEN) sock.send("ping");
    }, HEARTBEAT_MS);
  };

  sock.onmessage = (ev) => {
    if (ev.data === "pong") return;
    let msg: { type: string; items?: CartItem[]; locked?: boolean; reason?: string };
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    const st = useCart.getState();
    if (msg.type === "snapshot") {
      st.applySnapshot(msg.items ?? [], !!msg.locked);
    } else if (msg.type === "denied") {
      st.onDenied?.(msg.reason ?? "没有权限");
      // 服务端拒绝了，拉一次权威状态把乐观更新回滚掉
      sock.send(JSON.stringify({ type: "pull" }));
    }
  };

  const down = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    if (ws !== sock) return;
    ws = null;
    useCart.getState().requeueInflight();
    setStatus("offline");
    scheduleRetry();
  };
  sock.onclose = down;
  sock.onerror = down;
}

function scheduleRetry() {
  if (retry) return;
  const delay = Math.min(1000 * 2 ** attempt++, MAX_BACKOFF_MS);
  retry = setTimeout(() => {
    retry = null;
    connect();
  }, delay);
}

export function disconnect() {
  if (heartbeat) clearInterval(heartbeat);
  if (retry) clearTimeout(retry);
  heartbeat = retry = null;
  setOpSink(null);
  const sock = ws;
  ws = null;
  sock?.close();
  setStatus("offline");
}

/** 切回前台时补一次，避免拿着过期数据 */
export function wakeUp() {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "pull" }));
  else connect();
}

export function startSync() {
  setOpSink(flush);
  connect();
  const onVisible = () => {
    if (document.visibilityState === "visible") wakeUp();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", wakeUp);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", wakeUp);
    disconnect();
  };
}
