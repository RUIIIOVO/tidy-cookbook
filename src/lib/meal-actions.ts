"use client";

/**
 * 订单类操作（下单 / 保存订单 / 删订单 / 买菜勾选）。这些操作必须在线，发出后等服务端 ack。
 * reqId 由调用方传入：失败重试时复用同一个，服务端按 reqId 去重，不会重复下单。
 */

import { toast } from "sonner";
import { useHistory } from "./history-store";
import type { Slot } from "./meal-time";
import { useCart } from "./store";
import { getSyncStatus, onSyncStatus, request, type Ack } from "./sync";

type Lines = { dishId: string; qty: number }[];

export function newReqId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // 非安全上下文（http 局域网调试）没有 randomUUID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 涉及的日期早于今天（已吃订单有变动）时，历史页的缓存要重拉 */
function refreshIfPast(...dates: (string | undefined)[]) {
  const today = useCart.getState().today;
  if (dates.some((d) => d && d < today)) useHistory.getState().invalidateAll();
}

/** 下单：点菜单里的 items 移进 (date, slot) 的订单；该餐已有订单就合并 */
export async function placeOrder(p: {
  reqId: string;
  date: string;
  slot: Slot;
  items: Lines;
}): Promise<Ack> {
  const ack = await request({ type: "placeOrder", ...p });
  if (ack.ok) refreshIfPast(p.date);
  return ack;
}

/**
 * 保存订单（整单覆盖）。
 * fromDate：编辑前订单原来的日期。改的是已吃订单、或把订单从过去挪走时，历史页也要刷新。
 */
export async function saveMeal(p: {
  reqId: string;
  mealId: string;
  rev: number;
  date: string;
  slot: Slot;
  items: Lines;
  fromDate?: string;
}): Promise<Ack> {
  const { fromDate, ...op } = p;
  const ack = await request({ type: "saveMeal", ...op });
  if (ack.ok) refreshIfPast(p.date, fromDate);
  return ack;
}

/** 删订单。date：订单的就餐日期，已吃订单（早于今天）删完会刷新历史页 */
export async function deleteMeal(p: {
  reqId?: string;
  mealId: string;
  date?: string;
}): Promise<Ack> {
  const ack = await request({
    type: "deleteMeal",
    reqId: p.reqId ?? newReqId(),
    mealId: p.mealId,
  });
  if (ack.ok) refreshIfPast(p.date);
  return ack;
}

// ── 买菜勾选 ──────────────────────────────────────────────────────────────
// 勾选先记进 store.buyQueue（界面立刻按它显示），再在后台发给服务端：
// - 服务端快照为准，本地没确认的勾选叠在快照上面，所以旧快照盖不掉刚点的勾选
// - 断网、超时都不回滚，联网后继续发（reqId 去重，重发不会出错）
// - 只有服务端明确拒绝（订单没了、没有这个食材）才撤销，并提示原因

/** 正在发送中的勾选，避免重复发 */
const sendingBuys = new Set<string>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    drainBuys();
  }, 4000);
}

/** 把队列里的勾选发出去；联网、切回前台、定时重试时都会调用 */
export function drainBuys() {
  if (typeof window === "undefined") return;
  if (getSyncStatus() !== "online") return;
  for (const job of useCart.getState().buyQueue) {
    if (sendingBuys.has(job.reqId)) continue;
    sendingBuys.add(job.reqId);
    void request(job).then((ack) => {
      sendingBuys.delete(job.reqId);
      if (ack.ok) {
        useCart.getState().settleBuy(job.reqId);
      } else if (ack.code) {
        // 服务端明确拒绝：撤销这次勾选
        useCart.getState().settleBuy(job.reqId);
        toast(ack.reason ?? "勾选没有生效");
      } else {
        // 超时 / 掉线：保留，稍后重发
        scheduleRetry();
      }
    });
  }
}

if (typeof window !== "undefined") {
  onSyncStatus((st) => {
    if (st === "online") drainBuys();
  });
  // 从后台切回来：连接可能已经悄悄断了，先补发一轮，发不出去会按重试节奏再来
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") drainBuys();
  });
}

/** 勾选 / 取消勾选买菜清单里的一项（合并后的食材可能涉及多张订单） */
export function buy(mealIds: string[], name: string, done: boolean): void {
  useCart.getState().queueBuy({ type: "buy", reqId: newReqId(), mealIds, name, done });
  drainBuys();
}
