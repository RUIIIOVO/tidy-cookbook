"use client";

import { create } from "zustand";
import { authHeaders } from "./auth-store";
import { deleteMeal } from "./meal-actions";
import { addDays } from "./meal-time";
import type { Meal, MealItem, MealReview } from "./protocol";
import { useCart } from "./store";
import { useTabs } from "./tab-store";

export type { Meal, MealItem, MealReview };

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
  updateReview: (mealId: string, review: MealReview | null) => void;
  /** 订单有变动（补录、改已吃订单等）后：所有范围标记为未初始化，并强制重拉当前范围 */
  invalidateAll: () => Promise<void>;
};

const PAGE_SIZE = 15;

const initialCache: Record<HistoryRange, RangeData> = {
  all: createEmptyBucket(),
  "7d": createEmptyBucket(),
  "30d": createEmptyBucket(),
  "90d": createEmptyBucket(),
};

type Page = { meals: Meal[]; nextCursor: string | null; hasMore: boolean };

async function fetchPage(range: HistoryRange, before: string | null): Promise<Page> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  // before 是服务端给的不透明游标，原样回传
  if (before !== null) params.set("before", before);
  const since = getSinceDate(range);
  if (since !== null) params.set("since", since);
  const r = await fetch(`/api/history?${params.toString()}`, {
    credentials: "same-origin",
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as Page;
}

/**
 * 每个范围的「第几次整页重拉」。整页重拉会作废还在路上的旧请求：
 * 晚到的旧首页、旧翻页回来时发现代号变了就丢掉，不会把新数据盖回去
 */
const gen: Record<HistoryRange, number> = { all: 0, "7d": 0, "30d": 0, "90d": 0 };

export const useHistory = create<HistoryState>()((set, get) => {
  /** 只改一个范围；永远基于最新状态合并，不用请求发出前的旧快照 */
  const patch = (range: HistoryRange, fn: (b: RangeData) => Partial<RangeData>) => {
    const cache = get().cache;
    const b = cache[range] ?? createEmptyBucket();
    set({ cache: { ...cache, [range]: { ...b, ...fn(b) } } });
  };

  return {
    range: "all",
    cache: initialCache,

    setRange: (range) => {
      if (get().range === range) return;
      set({ range });
      void get().ensureRange(range);
    },

    ensureRange: async (range, force = false) => {
      const bucket = get().cache[range] ?? createEmptyBucket();
      if (!force && (bucket.initialized || bucket.loading)) return;

      const my = ++gen[range];
      patch(range, () => ({ loading: true, loadingMore: false, error: null }));
      try {
        const data = await fetchPage(range, null);
        if (my !== gen[range]) return;
        patch(range, () => ({
          meals: data.meals,
          hasMore: Boolean(data.hasMore),
          nextCursor: data.nextCursor ?? null,
          loading: false,
          error: null,
          initialized: true,
        }));
      } catch {
        if (my !== gen[range]) return;
        patch(range, () => ({ loading: false, error: "加载订单失败，请重试", initialized: true }));
      }
    },

    loadMoreForRange: async (range) => {
      const bucket = get().cache[range];
      if (!bucket || bucket.loading || bucket.loadingMore || !bucket.hasMore || bucket.nextCursor === null) {
        return;
      }

      const my = gen[range];
      patch(range, () => ({ loadingMore: true }));
      try {
        const data = await fetchPage(range, bucket.nextCursor);
        if (my !== gen[range]) return;
        patch(range, (b) => {
          // 翻页期间可能删了单或刷新过，按 id 去重合并到最新列表上
          const seen = new Set(b.meals.map((m) => m.id));
          return {
            meals: [...b.meals, ...data.meals.filter((m) => !seen.has(m.id))],
            hasMore: Boolean(data.hasMore),
            nextCursor: data.nextCursor ?? null,
            loadingMore: false,
          };
        });
      } catch {
        if (my !== gen[range]) return;
        patch(range, () => ({ loadingMore: false }));
      }
    },

    remove: async (id) => {
      const drop = (b: RangeData): RangeData => ({ ...b, meals: b.meals.filter((m) => m.id !== id) });
      const c = get().cache;
      set({ cache: { all: drop(c.all), "7d": drop(c["7d"]), "30d": drop(c["30d"]), "90d": drop(c["90d"]) } });

      const ack = await deleteMeal({ mealId: id });
      if (ack.ok) return true;
      // 删除失败：期间可能翻过页，不整体回滚旧快照，直接重拉
      void get().invalidateAll();
      return false;
    },

    updateReview: (mealId: string, review: MealReview | null) => {
      const updateMeals = (meals: Meal[]) =>
        meals.map((m) => (m.id === mealId ? { ...m, review } : m));
      const c = get().cache;
      set({
        cache: {
          all: { ...c.all, meals: updateMeals(c.all.meals) },
          "7d": { ...c["7d"], meals: updateMeals(c["7d"].meals) },
          "30d": { ...c["30d"], meals: updateMeals(c["30d"].meals) },
          "90d": { ...c["90d"], meals: updateMeals(c["90d"].meals) },
        },
      });
    },

    invalidateAll: async () => {
      const cleared = Object.fromEntries(
        Object.entries(get().cache).map(([k, v]) => [k, { ...v, initialized: false }]),
      ) as Record<HistoryRange, RangeData>;
      set({ cache: cleared });
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
