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
  { key: "90d", label: "近 3 个月", days: 90 },
  { key: "30d", label: "近 1 个月", days: 30 },
  { key: "7d", label: "近 7 天", days: 7 },
];

export function getSinceTimestamp(range: HistoryRange): number | null {
  if (range === "7d") return Date.now() - 7 * 86400_000;
  if (range === "30d") return Date.now() - 30 * 86400_000;
  if (range === "90d") return Date.now() - 90 * 86400_000;
  return null;
}

export type RangeData = {
  meals: Meal[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  nextCursor: number | null;
  error: string | null;
  initialized: boolean;
};

const createEmptyBucket = (): RangeData => ({
  meals: [],
  loading: false,
  loadingMore: false,
  hasMore: false,
  nextCursor: null,
  error: null,
  initialized: false,
});

type HistoryState = {
  range: HistoryRange;
  cache: Record<HistoryRange, RangeData>;
  setRange: (range: HistoryRange) => void;
  ensureRange: (range: HistoryRange, force?: boolean) => Promise<void>;
  loadMoreForRange: (range: HistoryRange) => Promise<void>;
  remove: (id: string) => Promise<boolean>;

  // 兼容老调用方访问当前 range 数据
  meals: Meal[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
};

const PAGE_SIZE = 15;

const initialCache: Record<HistoryRange, RangeData> = {
  all: createEmptyBucket(),
  "7d": createEmptyBucket(),
  "30d": createEmptyBucket(),
  "90d": createEmptyBucket(),
};

export const useHistory = create<HistoryState>()((set, get) => {
  const syncConvenience = (cache: Record<HistoryRange, RangeData>, range: HistoryRange) => {
    const activeData = cache[range] ?? createEmptyBucket();
    return {
      range,
      cache,
      meals: activeData.meals,
      loading: activeData.loading,
      loadingMore: activeData.loadingMore,
      hasMore: activeData.hasMore,
      error: activeData.error,
    };
  };

  return {
    range: "all",
    cache: initialCache,
    meals: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    error: null,

    setRange: (range) => {
      const cur = get().range;
      if (cur === range) return;
      const cache = get().cache;
      set(syncConvenience(cache, range));
      void get().ensureRange(range);
    },

    ensureRange: async (range, force = false) => {
      const bucket = get().cache[range] ?? createEmptyBucket();
      if (!force && (bucket.initialized || bucket.loading)) return;

      const nextCache = {
        ...get().cache,
        [range]: { ...bucket, loading: true, error: null },
      };
      set(syncConvenience(nextCache, get().range));

      try {
        const since = getSinceTimestamp(range);
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

        const updated = {
          ...get().cache,
          [range]: {
            meals: data.meals,
            hasMore: Boolean(data.hasMore),
            nextCursor: data.nextCursor ?? null,
            loading: false,
            loadingMore: false,
            error: null,
            initialized: true,
          },
        };
        set(syncConvenience(updated, get().range));
      } catch {
        const failed = {
          ...get().cache,
          [range]: {
            ...bucket,
            loading: false,
            error: "暂无历史记录",
            initialized: true,
          },
        };
        set(syncConvenience(failed, get().range));
      }
    },

    loadMoreForRange: async (range) => {
      const bucket = get().cache[range];
      if (!bucket || bucket.loading || bucket.loadingMore || !bucket.hasMore || bucket.nextCursor === null) {
        return;
      }

      const nextCache = {
        ...get().cache,
        [range]: { ...bucket, loadingMore: true },
      };
      set(syncConvenience(nextCache, get().range));

      try {
        const since = getSinceTimestamp(range);
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          before: String(bucket.nextCursor),
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

        const updated = {
          ...get().cache,
          [range]: {
            ...bucket,
            meals: [...bucket.meals, ...data.meals],
            hasMore: Boolean(data.hasMore),
            nextCursor: data.nextCursor ?? null,
            loadingMore: false,
          },
        };
        set(syncConvenience(updated, get().range));
      } catch {
        const failed = {
          ...get().cache,
          [range]: { ...bucket, loadingMore: false },
        };
        set(syncConvenience(failed, get().range));
      }
    },

    load: async () => {
      await get().ensureRange(get().range, true);
    },

    loadMore: async () => {
      await get().loadMoreForRange(get().range);
    },

    remove: async (id) => {
      const prevCache = get().cache;
      const updatedCache: Record<HistoryRange, RangeData> = {
        all: { ...prevCache.all, meals: prevCache.all.meals.filter((m) => m.id !== id) },
        "7d": { ...prevCache["7d"], meals: prevCache["7d"].meals.filter((m) => m.id !== id) },
        "30d": { ...prevCache["30d"], meals: prevCache["30d"].meals.filter((m) => m.id !== id) },
        "90d": { ...prevCache["90d"], meals: prevCache["90d"].meals.filter((m) => m.id !== id) },
      };
      set(syncConvenience(updatedCache, get().range));

      try {
        const r = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "same-origin",
          headers: authHeaders(),
        });
        if (!r.ok) throw new Error(String(r.status));
        return true;
      } catch {
        set(syncConvenience(prevCache, get().range));
        return false;
      }
    },
  };
});
