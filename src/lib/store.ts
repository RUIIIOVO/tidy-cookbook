"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = { dishId: string; qty: number; addedAt: number };

type CartState = {
  items: CartItem[];
  locked: boolean;
  add: (dishId: string, qty?: number) => void;
  setQty: (dishId: string, qty: number) => void;
  remove: (dishId: string) => void;
  removeMany: (ids: string[]) => void;
  clear: () => void;
  lock: () => void;
  unlock: () => void;
  qtyOf: (dishId: string) => number;
  count: () => number;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      locked: false,
      add: (dishId, qty = 1) =>
        set((s) => {
          if (s.locked) return s;
          const found = s.items.find((i) => i.dishId === dishId);
          return found
            ? {
                items: s.items.map((i) =>
                  i.dishId === dishId ? { ...i, qty: i.qty + qty } : i,
                ),
              }
            : { items: [...s.items, { dishId, qty, addedAt: Date.now() }] };
        }),
      setQty: (dishId, qty) =>
        set((s) => ({
          items:
            qty <= 0
              ? s.items.filter((i) => i.dishId !== dishId)
              : s.items.map((i) => (i.dishId === dishId ? { ...i, qty } : i)),
        })),
      remove: (dishId) =>
        set((s) => ({ items: s.items.filter((i) => i.dishId !== dishId) })),
      removeMany: (ids) =>
        set((s) => ({ items: s.items.filter((i) => !ids.includes(i.dishId)) })),
      clear: () => set({ items: [], locked: false }),
      lock: () => set({ locked: true }),
      unlock: () => set({ locked: false }),
      qtyOf: (dishId) => get().items.find((i) => i.dishId === dishId)?.qty ?? 0,
      count: () => get().items.reduce((n, i) => n + i.qty, 0),
    }),
    { name: "caipu-cart", version: 1 },
  ),
);
