"use client";

import { create } from "zustand";
import { authHeaders } from "./auth-store";
import { useTabs } from "./tab-store";

/** 一道菜的单菜评分：平均星级（一位小数）和评分次数 */
export type DishRating = { avg: number; n: number };

type State = {
  ratings: Record<string, DishRating>;
  loadedAt: number;
  /** 拉取最新评分；15 秒内拉过就跳过，force 时无视 */
  refresh: (force?: boolean) => Promise<void>;
};

let inflight = false;

export const useDishRatings = create<State>()((set, get) => ({
  ratings: {},
  loadedAt: 0,
  refresh: async (force = false) => {
    if (inflight) return;
    if (!force && Date.now() - get().loadedAt < 15_000) return;
    inflight = true;
    try {
      const res = await fetch("/api/dish-ratings", { credentials: "same-origin", headers: authHeaders() });
      if (!res.ok) return;
      const json = (await res.json()) as { ratings?: Record<string, DishRating> };
      set({ ratings: json.ratings ?? {}, loadedAt: Date.now() });
    } catch {
      /* 网络不好就沿用旧数据 */
    } finally {
      inflight = false;
    }
  },
}));

// 评分可能被家里别人更新：每次切到会显示评分的页面，静默刷新一次
useTabs.subscribe((s, prev) => {
  if (s.activeTab !== prev.activeTab && (s.activeTab === "draw" || s.activeTab === "menu")) {
    void useDishRatings.getState().refresh();
  }
});
