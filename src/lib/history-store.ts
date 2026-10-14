"use client";

import { create } from "zustand";
import { authHeaders } from "./auth-store";

export type MealItem = { dishId: string; qty: number; addedBy?: string | null };
export type Meal = {
  id: string;
  orderedAt: number;
  orderedBy: string | null;
  items: MealItem[];
};

type HistoryState = {
  meals: Meal[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  nextCursor: number | null;
  error: string | null;
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  remove: (id: string) => Promise<boolean>;
};

const PAGE_SIZE = 15;

export const useHistory = create<HistoryState>()((set, get) => ({
  meals: [],
  loading: false,
  loadingMore: false,
  hasMore: false,
  nextCursor: null,
  error: null,

  load: async () => {
    // 首次/重置加载
    set({ loading: true, error: null });
    try {
      const r = await fetch(`/api/history?limit=${PAGE_SIZE}`, {
        credentials: "same-origin",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as {
        meals: Meal[];
        nextCursor: number | null;
        hasMore: boolean;
      };
      set({
        meals: data.meals,
        hasMore: Boolean(data.hasMore),
        nextCursor: data.nextCursor ?? null,
        loading: false,
      });
    } catch {
      set({ loading: false, error: "暂无历史记录" });
    }
  },

  loadMore: async () => {
    const { loading, loadingMore, hasMore, nextCursor, meals } = get();
    if (loading || loadingMore || !hasMore || nextCursor === null) return;

    set({ loadingMore: true });
    try {
      const r = await fetch(
        `/api/history?limit=${PAGE_SIZE}&before=${nextCursor}`,
        {
          credentials: "same-origin",
          headers: authHeaders(),
        },
      );
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as {
        meals: Meal[];
        nextCursor: number | null;
        hasMore: boolean;
      };

      set({
        meals: [...meals, ...data.meals],
        hasMore: Boolean(data.hasMore),
        nextCursor: data.nextCursor ?? null,
        loadingMore: false,
      });
    } catch {
      set({ loadingMore: false });
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
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(String(r.status));
      return true;
    } catch {
      set({ meals: before });
      return false;
    }
  },
}));
