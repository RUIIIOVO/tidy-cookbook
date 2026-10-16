"use client";

/**
 * 订单类操作（下单 / 保存订单 / 删订单 / 买菜勾选）。这些操作必须在线，发出后等服务端 ack。
 * reqId 由调用方传入：失败重试时复用同一个，服务端按 reqId 去重，不会重复下单。
 */

import { toast } from "sonner";
import { useHistory } from "./history-store";
import type { Slot } from "./meal-time";
import type { BoughtMark } from "./protocol";
import { useCart } from "./store";
import { getSyncStatus, request, type Ack } from "./sync";

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

/** 在 bought 上套用一次勾选 / 取消勾选（幂等） */
function applyMarks(
  bought: BoughtMark[],
  mealIds: string[],
  name: string,
  done: boolean,
): BoughtMark[] {
  const ids = new Set(mealIds);
  const rest = bought.filter((m) => !(m.name === name && ids.has(m.mealId)));
  return done ? [...rest, ...mealIds.map((mealId) => ({ mealId, name }))] : rest;
}

/**
 * 勾选 / 取消勾选买菜清单里的一项（合并后的食材可能涉及多张订单）。
 * 先乐观更新 store.bought，失败则反向恢复并提示。
 */
export async function buy(mealIds: string[], name: string, done: boolean): Promise<Ack> {
  const { setBought } = useCart.getState();
  setBought(applyMarks(useCart.getState().bought, mealIds, name, done));
  const op = { type: "buy" as const, reqId: newReqId(), mealIds, name, done };
  // 离线：和点菜单一样先记进队列，联网后自动补发（reqId 去重）
  if (getSyncStatus() !== "online") {
    useCart.getState().enqueue(op);
    return { ok: true };
  }
  const ack = await request(op);
  if (!ack.ok) {
    // 反向恢复而不是还原旧快照：等待期间可能已经来了新的服务端快照
    setBought(applyMarks(useCart.getState().bought, mealIds, name, !done));
    toast(ack.reason ?? "操作失败");
  }
  return ack;
}
