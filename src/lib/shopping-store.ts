"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 买菜清单的勾选状态。
 * 以前存在组件自己的 useState 里，切 tab 组件卸载就丢；这里放进 store 并写入 localStorage，
 * 切页面、刷新都保留。只存本机，不跨设备同步。
 */
type ShoppingState = {
  /** 已买的食材名（清单按食材名合并，名字就是唯一键） */
  done: string[];
  toggle: (name: string) => void;
  /** 只保留仍在清单里的：菜从点菜单删掉后，对应食材的勾选一并清掉 */
  keepOnly: (names: string[]) => void;
  reset: () => void;
};

export const useShopping = create<ShoppingState>()(
  persist(
    (set, get) => ({
      done: [],
      toggle: (name) =>
        set((s) => ({
          done: s.done.includes(name) ? s.done.filter((x) => x !== name) : [...s.done, name],
        })),
      keepOnly: (names) => {
        const keep = new Set(names);
        const cur = get().done;
        const next = cur.filter((n) => keep.has(n));
        if (next.length !== cur.length) set({ done: next });
      },
      reset: () => {
        if (get().done.length) set({ done: [] });
      },
    }),
    { name: "tidy-cookbook-shopping-done", version: 1 },
  ),
);
