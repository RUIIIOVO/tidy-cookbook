"use client";

/**
 * 点菜单 / 订单的跨设备同步。
 *
 * 点菜单（CartOp）离线优先：
 *   本地先改（乐观更新）→ 进 outbox → WS 发出（转 inflight）→ 服务端广播快照 → 覆盖本地。
 *   断网照常加菜，重连后 outbox 自动回放；掉线时 inflight 退回 outbox 重发。
 *
 * 订单类操作（RequestOp）必须在线：request() 发出后等服务端 ack，
 *   断线重连会用同一 reqId 重发（服务端按 reqId 去重），15 秒没回执就放弃等待。
 */

import { useSyncExternalStore } from "react";
import { getToken } from "./auth-store";
import {
  PROTOCOL_VERSION,
  type RequestOp,
  type ServerMessage,
} from "./protocol";
import { setOpSink, useCart } from "./store";

export type SyncStatus = "offline" | "connecting" | "online";
type Listener = (s: SyncStatus) => void;

/** 服务端 ack 的内容（不含 type / reqId） */
export type Ack = {
  ok: boolean;
  reason?: string;
  code?: "conflict" | "forbidden" | "invalid" | "not_found";
  mealId?: string;
};

const HEARTBEAT_MS = 25_000;
const REQUEST_TIMEOUT_MS = 15_000;
const RELOAD_FLAG = "tc-proto-reload";
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

/** 同步状态的 React hook */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => status,
    () => "offline" as SyncStatus,
  );
}

// ── 订单类请求 ──
type Pending = {
  op: RequestOp;
  promise: Promise<Ack>;
  resolve: (a: Ack) => void;
  timer: ReturnType<typeof setTimeout>;
};
const pending = new Map<string, Pending>();

function settle(reqId: string, ack: Ack) {
  const p = pending.get(reqId);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(reqId);
  p.resolve(ack);
}

const armTimer = (reqId: string) =>
  setTimeout(
    () => settle(reqId, { ok: false, reason: "网络不稳，稍后刷新看看是否已生效" }),
    REQUEST_TIMEOUT_MS,
  );

/**
 * 发一个需要回执的操作。reqId 由调用方生成并在重试时复用（服务端去重，不会重复下单）。
 * 离线直接失败；在线则等 ack，断线重连后自动用同一 reqId 重发，15 秒没回执视为失败。
 */
export function request(op: RequestOp): Promise<Ack> {
  const exist = pending.get(op.reqId);
  if (exist) return exist.promise;
  if (ws?.readyState !== WebSocket.OPEN) {
    return Promise.resolve({ ok: false, reason: "离线中，联网后再试" });
  }
  let resolve!: (a: Ack) => void;
  const promise = new Promise<Ack>((r) => (resolve = r));
  pending.set(op.reqId, { op, promise, resolve, timer: armTimer(op.reqId) });
  ws.send(JSON.stringify(op));
  return promise;
}

/** 重连后把还没回执的请求用原 reqId 再发一遍，并重新计时 */
function resendPending() {
  if (ws?.readyState !== WebSocket.OPEN) return;
  for (const [reqId, p] of pending) {
    clearTimeout(p.timer);
    p.timer = armTimer(reqId);
    ws.send(JSON.stringify(p.op));
  }
}

/** 服务端说客户端协议版本过旧：整页刷新一次拿新代码，用 sessionStorage 防止死循环 */
function handleReload() {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) {
      useCart.getState().onDenied?.("页面版本过旧，请手动刷新");
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    return; // 读写不了 sessionStorage 就不冒险自动刷新
  }
  location.reload();
}

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
  // 浏览器 WebSocket 不能自定义请求头：cookie 在就走 cookie，同时把令牌放进子协议兜底，
  // 这样 cookie 被浏览器清掉时仍能连上，令牌也不会出现在 URL 里
  const token = getToken();
  const sock = token
    ? new WebSocket(`${proto}//${location.host}/api/sync?v=${PROTOCOL_VERSION}`, [`auth.${token}`])
    : new WebSocket(`${proto}//${location.host}/api/sync?v=${PROTOCOL_VERSION}`);
  ws = sock;

  sock.onopen = () => {
    attempt = 0;
    setStatus("online");
    flush();
    resendPending();
    // 心跳由 DO 的 setWebSocketAutoResponse("ping","pong") 在平台层应答，
    // 不唤醒 Durable Object，也就不消耗 100k/天 的请求额度
    heartbeat = setInterval(() => {
      if (sock.readyState === WebSocket.OPEN) sock.send("ping");
    }, HEARTBEAT_MS);
  };

  sock.onmessage = (ev) => {
    if (ev.data === "pong") return;
    let msg: ServerMessage;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    const st = useCart.getState();
    if (msg.type === "snapshot") {
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch {}
      st.applySnapshot(msg);
    } else if (msg.type === "ack") {
      settle(msg.reqId, { ok: msg.ok, reason: msg.reason, code: msg.code, mealId: msg.mealId });
    } else if (msg.type === "denied") {
      st.onDenied?.(msg.reason ?? "没有权限");
      // 服务端拒绝了，拉一次权威状态把乐观更新回滚掉
      sock.send(JSON.stringify({ type: "pull" }));
    } else if (msg.type === "reload") {
      handleReload();
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
