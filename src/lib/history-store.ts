"use client";

import { create } from "zustand";
import { authHeaders } from "./auth-store";
import { deleteMeal } from "./meal-actions";
import { addDays } from "./meal-time";
import type { Meal, MealItem } from "./protocol";
import { useCart } from "./store";
import { useTabs } from "./tab-store";

export type { Meal, MealItem };

export type HistoryRange = "all" | "7d" | "30d" | "90d";

export const RANGE_OPTIONS: { key: HistoryRange; label: string; days: number | null }[] = [
  { key: "all", label: "全部", days: null },
  { key: "90d", label: "近 3 个月", days: 90 },
  { key: "30d", label: "近 1 个月", days: 30 },
  { key: "7d", label: "近 7 天", days: 7 },
];

/** 范围起点（就餐日期，'YYYY-MM-DD'），以服务端认定的「今天」为准；「全部」返回 null */
export function getSinceDate(range: HistoryRange): string | null {
  const days = RANGE_OPTIONS.find((o) => o.key === range)?.days;
  return days ? addDays(useCart.getState().today, -days) : null;
}

export type RangeData = {
  meals: Meal[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  nextCursor: string | null;
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
  /** 订单有变动（补录、改已吃订单等）后：所有范围标记为未初始化，并强制重拉当前范围 */
  invalidateAll: () => Promise<void>;

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
        const since = getSinceDate(range);
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (since !== null) params.set("since", since);

        const r = await fetch(`/api/history?${params.toString()}`, {
          credentials: "same-origin",
          headers: authHeaders(),
        });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as {
          meals: Meal[];
          nextCursor: string | null;
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
            error: "没读到订单，重试一下",
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
        const since = getSinceDate(range);
        // before 是服务端给的不透明游标，原样回传
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          before: bucket.nextCursor,
        });
        if (since !== null) params.set("since", since);

        const r = await fetch(`/api/history?${params.toString()}`, {
          credentials: "same-origin",
          headers: authHeaders(),
        });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as {
          meals: Meal[];
          nextCursor: string | null;
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

      const ack = await deleteMeal({ mealId: id });
      if (ack.ok) return true;
      set(syncConvenience(prevCache, get().range));
      return false;
    },

    invalidateAll: async () => {
      const cleared = Object.fromEntries(
        Object.entries(get().cache).map(([k, v]) => [k, { ...v, initialized: false }]),
      ) as Record<HistoryRange, RangeData>;
      set(syncConvenience(cleared, get().range));
      await get().ensureRange(get().range, true);
    },
  };
});

// 「今天」变了（凌晨 4 点切日）：昨天的待吃订单变成已吃，历史页要重拉
let lastToday = useCart.getState().today;
useCart.subscribe((s) => {
  if (s.today === lastToday) return;
  lastToday = s.today;
  // 历史页还没打开过就不用拉
  if (!Object.values(useHistory.getState().cache).some((b) => b.initialized)) return;
  void useHistory.getState().invalidateAll();
});

// 订单可能在别的设备上被补录、修改、删除，这些不走实时同步。
// 每次切到订单页，把已加载的数据静默重拉一次（列表先照旧显示，拉到再替换）
useTabs.subscribe((s, prev) => {
  if (s.activeTab !== "history" || prev.activeTab === "history") return;
  const { range, cache } = useHistory.getState();
  if (!cache[range]?.initialized) return;
  // 其它时间段标记为过期，切过去时再拉
  const stale = Object.fromEntries(
    Object.entries(cache).map(([k, v]) => [k, k === range ? v : { ...v, initialized: false }]),
  ) as Record<HistoryRange, RangeData>;
  useHistory.setState({ cache: stale });
  void useHistory.getState().ensureRange(range, true);
});
