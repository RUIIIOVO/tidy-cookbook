"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { normalizeDishId } from "@/data/dishes";
import { useAuth } from "./auth-store";

export type CartItem = {
  dishId: string;
  qty: number;
  addedAt: number;
  /** 第一个点这道菜的人，服务端快照为准；老数据可能没有 */
  addedBy?: string | null;
};

export type Op =
  | { type: "set"; dishId: string; qty: number; ts: number }
  | { type: "removeMany"; dishIds: string[]; ts: number }
  | { type: "clear"; ts: number }
  | { type: "lock"; ts: number }
  | { type: "unlock"; ts: number }
  | { type: "buy"; name: string; done: boolean; ts: number };

/** sync.ts 注册进来的发送钩子。store 不反向 import sync，避免循环依赖。 */
let sink: (() => void) | null = null;
export function setOpSink(fn: (() => void) | null) {
  sink = fn;
}

type CartState = {
  items: CartItem[];
  locked: boolean;
  /** 买菜清单里已勾选（已买）的食材名；和点菜单一样走服务端同步，全员共享 */
  bought: string[];
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
  /** 勾选 / 取消勾选一项食材。不受锁定限制：下单之后才是买菜的时候 */
  buy: (name: string, done: boolean) => void;
  qtyOf: (dishId: string) => number;
  count: () => number;

  // ── 同步层内部用 ──
  enqueue: (op: Op) => void;
  takeOutbox: () => Op[];
  requeueInflight: () => void;
  applySnapshot: (items: CartItem[], locked: boolean, bought: string[]) => void;
  setOnDenied: (fn: (reason: string) => void) => void;
};

const fixItem = (i: CartItem): CartItem => ({ ...i, dishId: normalizeDishId(i.dishId) });

/** 旧版本把菜品 id 存成拼音 slug，本地缓存里的点菜单和待发操作要转成数字 id */
const fixOp = (op: Op): Op => {
  if (op.type === "set") return { ...op, dishId: normalizeDishId(op.dishId) };
  if (op.type === "removeMany") return { ...op, dishIds: op.dishIds.map(normalizeDishId) };
  return op;
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
        bought: [],
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
              : [
                  ...s.items,
                  {
                    dishId,
                    qty: next,
                    addedAt: Date.now(),
                    addedBy: useAuth.getState().me?.displayName ?? null,
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
          set({ items: [], locked: false, bought: [] });
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

        buy: (name, done) => {
          set((s) => ({
            bought: done
              ? s.bought.includes(name)
                ? s.bought
                : [...s.bought, name]
              : s.bought.filter((n) => n !== name),
          }));
          emit({ type: "buy", name, done, ts: Date.now() });
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
        applySnapshot: (items, locked, bought) =>
          set({ items: items.map(fixItem), locked, bought, inflight: [] }),

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
        bought: s.bought,
        outbox: s.outbox,
        inflight: s.inflight,
      }),
      migrate: (old) => {
        const o = (old ?? {}) as Partial<CartState>;
        return { ...o, outbox: [], inflight: [] } as CartState;
      },
      // 每次从 localStorage 读出来都规整一遍，不依赖版本号
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CartState>;
        return {
          ...current,
          ...p,
          items: (p.items ?? current.items).map(fixItem),
          bought: p.bought ?? [],
          outbox: (p.outbox ?? []).map(fixOp),
          inflight: (p.inflight ?? []).map(fixOp),
        };
      },
    },
  ),
);
