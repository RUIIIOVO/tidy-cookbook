"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { normalizeDishId } from "@/data/dishes";
import { useAuth } from "./auth-store";
import { mealDayOf } from "./meal-time";
import type { BoughtMark, CartItem, CartOp, Meal, MealItem, Snapshot } from "./protocol";

export type { BoughtMark, CartItem, Meal, MealItem, Snapshot };
/** 点菜单操作（可离线排队），即协议里的 CartOp */
export type Op = CartOp;

/** sync.ts 注册进来的发送钩子。store 不反向 import sync，避免循环依赖。 */
let sink: (() => void) | null = null;
export function setOpSink(fn: (() => void) | null) {
  sink = fn;
}

type CartState = {
  /** 服务端认定的餐饮日；快照到达前用本机时钟估一个 */
  today: string;
  /** 点菜单 */
  items: CartItem[];
  /** 待吃订单（mealDate >= today），随快照实时同步 */
  meals: Meal[];
  /** 买菜清单里已勾选的 (订单, 食材) */
  bought: BoughtMark[];
  /** 菜品历史累计点单次数：dishId -> count，O(1) 极速读取 */
  stats: Record<string, number>;
  /** 还没送到服务端的操作 */
  outbox: Op[];
  /** 已发出、等服务端快照确认的操作 */
  inflight: Op[];
  onDenied?: (reason: string) => void;

  add: (dishId: string, qty?: number) => void;
  setQty: (dishId: string, qty: number) => void;
  remove: (dishId: string) => void;
  removeMany: (ids: string[]) => void;
  clear: () => void;
  qtyOf: (dishId: string) => number;
  count: () => number;

  // ── 同步层内部用 ──
  enqueue: (op: Op) => void;
  takeOutbox: () => Op[];
  requeueInflight: () => void;
  applySnapshot: (snap: Snapshot) => void;
  /** 订单类操作成功后，乐观地更新买菜勾选（失败时回滚用） */
  setBought: (bought: BoughtMark[]) => void;
  setOnDenied: (fn: (reason: string) => void) => void;
};

const fixItem = (i: CartItem): CartItem => ({ ...i, dishId: normalizeDishId(i.dishId) });

/** 旧版本把菜品 id 存成拼音 slug，本地缓存里的点菜单和待发操作要转成数字 id */
const fixOp = (op: Op): Op => {
  if (op.type === "set") return { ...op, dishId: normalizeDishId(op.dishId) };
  if (op.type === "removeMany") return { ...op, dishIds: op.dishIds.map(normalizeDishId) };
  return op;
};

/** 只保留点菜单操作；旧版本遗留的 lock / unlock / buy 直接丢弃 */
const keepCartOps = (ops: unknown): Op[] =>
  (Array.isArray(ops) ? ops : []).filter(
    (o): o is Op =>
      !!o && (o.type === "set" || o.type === "removeMany" || o.type === "clear"),
  );

const isMark = (m: unknown): m is BoughtMark =>
  !!m && typeof (m as BoughtMark).mealId === "string" && typeof (m as BoughtMark).name === "string";

export const useCart = create<CartState>()(
  persist(
    (set, get) => {
      /** 本地乐观更新 + 记一笔待发操作 */
      const emit = (op: Op) => {
        set((s) => ({ outbox: [...s.outbox, op] }));
        sink?.();
      };

      return {
        today: mealDayOf(Date.now()),
        items: [],
        meals: [],
        bought: [],
        stats: {},
        outbox: [],
        inflight: [],

        add: (dishId, qty = 1) => {
          const s = get();
          const cur = s.items.find((i) => i.dishId === dishId)?.qty ?? 0;
          const next = cur + qty;
          const me = useAuth.getState().me;
          set({
            items: cur
              ? s.items.map((i) => (i.dishId === dishId ? { ...i, qty: next } : i))
              : [
                  ...s.items,
                  {
                    dishId,
                    qty: next,
                    addedAt: Date.now(),
                    addedById: me?.id ?? null,
                    addedBy: me?.displayName ?? null,
                  },
                ],
          });
          // 发绝对值而不是增量：重放时幂等，不会翻倍
          emit({ type: "set", dishId, qty: next, ts: Date.now() });
        },

        setQty: (dishId, qty) => {
          set((s) => ({
            items:
              qty <= 0
                ? s.items.filter((i) => i.dishId !== dishId)
                : s.items.map((i) => (i.dishId === dishId ? { ...i, qty } : i)),
          }));
          emit({ type: "set", dishId, qty, ts: Date.now() });
        },

        remove: (dishId) => {
          set((s) => ({ items: s.items.filter((i) => i.dishId !== dishId) }));
          emit({ type: "set", dishId, qty: 0, ts: Date.now() });
        },

        removeMany: (ids) => {
          set((s) => ({ items: s.items.filter((i) => !ids.includes(i.dishId)) }));
          emit({ type: "removeMany", dishIds: ids, ts: Date.now() });
        },

        clear: () => {
          set({ items: [] });
          emit({ type: "clear", ts: Date.now() });
        },

        qtyOf: (dishId) => get().items.find((i) => i.dishId === dishId)?.qty ?? 0,
        count: () => get().items.reduce((n, i) => n + i.qty, 0),

        // ── 同步层内部用 ──
        enqueue: (op) => emit(op),

        /** outbox → inflight，返回待发送的批次 */
        takeOutbox: () => {
          const { outbox, inflight } = get();
          if (!outbox.length) return [];
          set({ outbox: [], inflight: [...inflight, ...outbox] });
          return outbox;
        },

        /** 连接断了，把没确认的放回队首重试 */
        requeueInflight: () =>
          set((s) => ({ outbox: [...s.inflight, ...s.outbox], inflight: [] })),

        /** 服务端为准。inflight 到此确认完成。 */
        applySnapshot: (snap) =>
          set((s) => ({
            today: snap.today || s.today,
            items: (snap.items ?? []).map(fixItem),
            meals: snap.meals ?? [],
            bought: snap.bought ?? [],
            stats: snap.stats ?? s.stats,
            inflight: [],
          })),

        setBought: (bought) => set({ bought }),

        setOnDenied: (fn) => set({ onDenied: fn }),
      };
    },
    {
      name: "caipu-cart",
      version: 3,
      // onDenied 是函数，不能进 localStorage
      partialize: (s) => ({
        items: s.items,
        meals: s.meals,
        bought: s.bought,
        stats: s.stats,
        outbox: s.outbox,
        inflight: s.inflight,
      }),
      // v3：去掉锁单。旧的 bought 是食材名数组、旧 outbox 里有 lock/unlock/buy，都丢掉
      migrate: (old) => {
        const o = (old ?? {}) as Partial<CartState>;
        return {
          items: o.items ?? [],
          stats: o.stats ?? {},
          outbox: keepCartOps(o.outbox),
          inflight: keepCartOps(o.inflight),
        } as CartState;
      },
      // 每次从 localStorage 读出来都规整一遍，不依赖版本号
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CartState>;
        return {
          ...current,
          ...p,
          items: (p.items ?? current.items).map(fixItem),
          meals: Array.isArray(p.meals) ? p.meals : [],
          bought: Array.isArray(p.bought) ? p.bought.filter(isMark) : [],
          stats: p.stats ?? {},
          outbox: keepCartOps(p.outbox).map(fixOp),
          inflight: keepCartOps(p.inflight).map(fixOp),
        };
      },
    },
  ),
);
