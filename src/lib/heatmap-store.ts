"use client";

import { create } from "zustand";
import { authHeaders } from "./auth-store";
import { useTabs } from "./tab-store";

export type HeatmapDay = {
  mealCount: number;
  dishCount: number;
  hasReview: boolean;
  /** 当天各餐点评的平均星级，没有点评为 null */
  avgRating: number | null;
};

type HeatmapState = {
  /** 所有已拉取年份的数据，按 'YYYY-MM-DD' 合并成一张表 */
  data: Record<string, HeatmapDay>;
  /** 每个自然年的拉取状态 */
  years: Record<number, "loading" | "done">;
  /** 确保某一年的数据已拉取；force 时无论拉没拉过都重拉 */
  ensureYear: (year: number, force?: boolean) => Promise<void>;
  /** 订单 / 点评有变动后：把已拉过的年份全部重拉 */
  refresh: () => Promise<void>;
};

export const useHeatmap = create<HeatmapState>()((set, get) => ({
  data: {},
  years: {},

  ensureYear: async (year, force = false) => {
    const st = get().years[year];
    if (st === "loading" || (st === "done" && !force)) return;
    set({ years: { ...get().years, [year]: "loading" } });
    try {
      const params = new URLSearchParams({ from: `${year}-01-01`, to: `${year}-12-31` });
      const res = await fetch(`/api/history/heatmap?${params}`, {
        credentials: "same-origin",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { heatmap: Record<string, HeatmapDay> };
      // 先清掉这一年的旧数据再合并：被删掉的订单 / 点评不能残留
      const prefix = `${year}-`;
      const next: Record<string, HeatmapDay> = {};
      for (const [k, v] of Object.entries(get().data)) if (!k.startsWith(prefix)) next[k] = v;
      Object.assign(next, json.heatmap ?? {});
      set({ data: next, years: { ...get().years, [year]: "done" } });
    } catch {
      // 失败就把状态撤掉，下次还能重试
      const years = { ...get().years };
      delete years[year];
      set({ years });
    }
  },

  refresh: async () => {
    const loaded = Object.keys(get().years).map(Number);
    await Promise.all(loaded.map((y) => get().ensureYear(y, true)));
  },
}));

// 每次切到订单页都静默刷新一次：订单可能在别的设备上增删
useTabs.subscribe((s, prev) => {
  if (s.activeTab === "history" && prev.activeTab !== "history") void useHeatmap.getState().refresh();
});
