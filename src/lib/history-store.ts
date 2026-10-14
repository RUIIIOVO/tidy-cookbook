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

export type HistoryRange = "all" | "7d" | "30d" | "90d";

export const RANGE_OPTIONS: { key: HistoryRange; label: string; days: number | null }[] = [
  { key: "all", label: "全部", days: null },
  { key: "7d", label: "近 7 天", days: 7 },
  { key: "30d", label: "近 1 个月", days: 30 },
  { key: "90d", label: "近 3 个月", days: 90 },
];

function getSinceTimestamp(range: HistoryRange): number | null {
  if (range === "7d") return Date.now() - 7 * 86400_000;
  if (range === "30d") return Date.now() - 30 * 86400_000;
  if (range === "90d") return Date.now() - 90 * 86400_000;
  return null;
}

type HistoryState = {
  meals: Meal[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  nextCursor: number | null;
  error: string | null;
  range: HistoryRange;
  setRange: (range: HistoryRange) => void;
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
  range: "all",

  setRange: (range) => {
    if (get().range === range) return;
    set({ range, meals: [], nextCursor: null, hasMore: false });
    void get().load();
  },

  load: async () => {
    set({ loading: true, error: null });
    try {
      const since = getSinceTimestamp(get().range);
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (since !== null) params.set("since", String(since));

      const r = await fetch(`/api/history?${params.toString()}`, {
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
    const { loading, loadingMore, hasMore, nextCursor, meals, range } = get();
    if (loading || loadingMore || !hasMore || nextCursor === null) return;

    set({ loadingMore: true });
    try {
      const since = getSinceTimestamp(range);
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        before: String(nextCursor),
      });
      if (since !== null) params.set("since", String(since));

      const r = await fetch(`/api/history?${params.toString()}`, {
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
