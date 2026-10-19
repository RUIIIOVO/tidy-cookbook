"use client";

import { create } from "zustand";
import { authHeaders } from "./auth-store";
import { useCart } from "./store";
import { useTabs } from "./tab-store";

export type HeatmapDay = {
  mealCount: number;
  dishCount: number;
  hasReview: boolean;
};

type HeatmapState = {
  data: Record<string, HeatmapDay>;
  loading: boolean;
  initialized: boolean;
  fetchHeatmap: (force?: boolean) => Promise<void>;
};

export const useHeatmap = create<HeatmapState>()((set, get) => ({
  data: {},
  loading: false,
  initialized: false,

  fetchHeatmap: async (force = false) => {
    if (!force && (get().initialized || get().loading)) return;
    set({ loading: true });
    try {
      const today = useCart.getState().today;
      const params = new URLSearchParams({ days: "90" });
      if (today) params.set("since", today);
      const res = await fetch(`/api/history/heatmap?${params.toString()}`, {
        credentials: "same-origin",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { heatmap: Record<string, HeatmapDay> };
      set({ data: json.heatmap || {}, loading: false, initialized: true });
    } catch {
      set({ loading: false, initialized: true });
    }
  },
}));

// 当切到订单 tab 且未初始化时自动拉取
useTabs.subscribe((s) => {
  if (s.activeTab === "history" && !useHeatmap.getState().initialized) {
    void useHeatmap.getState().fetchHeatmap();
  }
});
