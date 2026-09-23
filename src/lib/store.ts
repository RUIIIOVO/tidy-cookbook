"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = { dishId: string; qty: number; addedAt: number };

export type Op =
  | { type: "set"; dishId: string; qty: number; ts: number }
  | { type: "removeMany"; dishIds: string[]; ts: number }
  | { type: "clear"; ts: number }
  | { type: "lock"; ts: number }
  | { type: "unlock"; ts: number };

/** sync.ts 注册进来的发送钩子。store 不反向 import sync，避免循环依赖。 */
let sink: (() => void) | null = null;
export function setOpSink(fn: (() => void) | null) {
  sink = fn;
}

type CartState = {
  items: CartItem[];
  locked: boolean;
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
  lock: () => void;
  unlock: () => void;
  qtyOf: (dishId: string) => number;
  count: () => number;

  // ── 同步层内部用 ──
  enqueue: (op: Op) => void;
  takeOutbox: () => Op[];
  requeueInflight: () => void;
  applySnapshot: (items: CartItem[], locked: boolean) => void;
  setOnDenied: (fn: (reason: string) => void) => void;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => {
      /** 本地乐观更新 + 记一笔待发操作 */
      const emit = (op: Op) => {
        set((s) => ({ outbox: [...s.outbox, op] }));
        sink?.();
      };

      return {
        items: [],
        locked: false,
        outbox: [],
        inflight: [],

        add: (dishId, qty = 1) => {
          const s = get();
          if (s.locked) return;
          const cur = s.items.find((i) => i.dishId === dishId)?.qty ?? 0;
          const next = cur + qty;
          set({
            items: cur
              ? s.items.map((i) => (i.dishId === dishId ? { ...i, qty: next } : i))
              : [...s.items, { dishId, qty: next, addedAt: Date.now() }],
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
          set({ items: [], locked: false });
          emit({ type: "clear", ts: Date.now() });
        },

        lock: () => {
          set({ locked: true });
          emit({ type: "lock", ts: Date.now() });
        },

        unlock: () => {
          set({ locked: false });
          emit({ type: "unlock", ts: Date.now() });
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
        applySnapshot: (items, locked) =>
          set({ items, locked, inflight: [] }),

        setOnDenied: (fn) => set({ onDenied: fn }),
      };
    },
    {
      name: "caipu-cart",
      version: 2,
      // onDenied 是函数，不能进 localStorage
      partialize: (s) => ({
        items: s.items,
        locked: s.locked,
        outbox: s.outbox,
        inflight: s.inflight,
      }),
      migrate: (old) => {
        const o = (old ?? {}) as Partial<CartState>;
        return { ...o, outbox: [], inflight: [] } as CartState;
      },
    },
  ),
);
