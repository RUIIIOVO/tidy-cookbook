"use client";

import { create } from "zustand";

export type MealItem = { dishId: string; qty: number };
export type Meal = {
  id: string;
  orderedAt: number;
  orderedBy: string | null;
  items: MealItem[];
};

type HistoryState = {
  meals: Meal[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  remove: (id: string) => Promise<boolean>;
};

export const useHistory = create<HistoryState>()((set, get) => ({
  meals: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const r = await fetch("/api/history", { credentials: "same-origin" });
      if (!r.ok) throw new Error(String(r.status));
      const { meals } = (await r.json()) as { meals: Meal[] };
      set({ meals, loading: false });
    } catch {
      set({ loading: false, error: "没取到历史记录" });
    }
  },

  remove: async (id) => {
    const before = get().meals;
    // 先本地移除，失败再放回去
    set({ meals: before.filter((m) => m.id !== id) });
    try {
      const r = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!r.ok) throw new Error(String(r.status));
      return true;
    } catch {
      set({ meals: before });
      return false;
    }
  },
}));
