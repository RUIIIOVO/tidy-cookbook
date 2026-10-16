"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowCounterClockwise, SpinnerGap } from "@phosphor-icons/react";
import { toast } from "sonner";
import { getDish } from "@/data/dishes";
import { canDelete, useAuth } from "@/lib/auth-store";
import { useConfirm } from "@/lib/confirm-store";
import {
  RANGE_OPTIONS,
  useHistory,
  type HistoryRange,
  type Meal,
  type RangeData,
} from "@/lib/history-store";
import { useCart } from "@/lib/store";
import { useMealsSplit } from "@/lib/use-meals";
import { useTabs } from "@/lib/tab-store";
import { ui } from "@/lib/ui";
import { cn, haptic } from "@/lib/utils";
import { useGuard } from "@/lib/use-guard";
import { Avatar } from "./avatar";
import { MealTicket } from "./meal-ticket";

export function HistoryView() {
  const me = useAuth((s) => s.me);
  const doLogout = useAuth((s) => s.logout);
  const range = useHistory((s) => s.range);
  const cache = useHistory((s) => s.cache);
  const setRange = useHistory((s) => s.setRange);
  const ensureRange = useHistory((s) => s.ensureRange);
  const confirm = useConfirm((s) => s.confirm);
  const { finishedToday } = useMealsSplit();

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // 当前激活的 tab 索引 (0: all, 1: 7d, 2: 30d, 3: 90d)
  const activeIndex = RANGE_OPTIONS.findIndex((o) => o.key === range);

  // 跟踪跟手水平拖动的实时像素位移
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [, startTransition] = useTransition();

  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    width: number;
    isHoriz: boolean | null;
    currentOffset: number;
  } | null>(null);

  // 首屏加载激活项
  useEffect(() => {
    void ensureRange(range);
  }, [range, ensureRange]);

  // 点击胶囊切换
  const handleSelectTab = (newRange: HistoryRange) => {
    if (newRange === range) return;
    haptic(6);
    setRange(newRange);
  };

  // ── 跟手拖动核心事件处理 ──────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const width = containerRef.current?.offsetWidth || window.innerWidth;
    touchStateRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      startTime: performance.now(),
      width,
      isHoriz: null,
      currentOffset: 0,
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const state = touchStateRef.current;
    if (!state) return;

    const t = e.touches[0];
    const dx = t.clientX - state.startX;
    const dy = t.clientY - state.startY;

    // 1. 初步裁决滑动方向（主方向锁定）
    if (state.isHoriz === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        if (Math.abs(dy) >= Math.abs(dx) * 1.15) {
          state.isHoriz = false; // 正常垂直上下翻看小票
          return;
        } else {
          state.isHoriz = true; // 水平跟手翻页
          setIsDragging(true);
        }
      } else {
        return;
      }
    }

    if (!state.isHoriz) return;

    // 2. 边缘阻尼弹性计算（非循环端位移施加阻尼，首尾相通）
    const effectiveDx = dx;

    // 3. 即刻预取：当手指发生有效横拖的第一瞬间，立即拉取目标相邻页数据
    if (dx < -15) {
      const nextKey = RANGE_OPTIONS[(activeIndex + 1) % RANGE_OPTIONS.length].key;
      void ensureRange(nextKey);
    } else if (dx > 15) {
      const prevKey = RANGE_OPTIONS[(activeIndex - 1 + RANGE_OPTIONS.length) % RANGE_OPTIONS.length].key;
      void ensureRange(prevKey);
    }

    state.currentOffset = effectiveDx;
    startTransition(() => {
      setDragOffset(effectiveDx);
    });
  };

  const onTouchEnd = () => {
    const state = touchStateRef.current;
    if (!state) return;

    if (state.isHoriz) {
      const dt = performance.now() - state.startTime;
      const dx = state.currentOffset;
      const vx = dx / Math.max(1, dt); // 瞬时滑动速度
      const width = state.width;

      let targetIndex = activeIndex;

      // 判定切换成立：滑动距离超过视口 20%，或甩动手势速度足够快（支持首尾循环穿梭）
      if (dx < -width * 0.2 || (vx < -0.32 && dx < -20)) {
        targetIndex = (activeIndex + 1) % RANGE_OPTIONS.length;
      } else if (dx > width * 0.2 || (vx > 0.32 && dx > 20)) {
        targetIndex = (activeIndex - 1 + RANGE_OPTIONS.length) % RANGE_OPTIONS.length;
      }

      if (targetIndex !== activeIndex) {
        haptic(8);
        setRange(RANGE_OPTIONS[targetIndex].key);
      }
    }

    setIsDragging(false);
    setDragOffset(0);
    touchStateRef.current = null;
  };

  const onTouchCancel = () => {
    setIsDragging(false);
    setDragOffset(0);
    touchStateRef.current = null;
  };

  const currentBucket = cache[range];

  return (
    <div
      id="history-view"
      className="flex h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] flex-col overflow-hidden bg-paper select-none"
    >
      {/* ── 固定顶部栏：标题、餐数统计、退出登录、时间跨度筛选 ─────────────── */}
      <header className="z-20 shrink-0 border-b border-line bg-paper/90 px-4 pt-4 pb-3 backdrop-blur-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[22px] tracking-wider text-ink">订单</h1>
            <div className="mt-1 min-h-[18px]">
              {currentBucket.loading && currentBucket.meals.length === 0 ? (
                <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
                  <span className="size-1.5 rounded-full bg-accent animate-pulse" />
                  <span>正在加载…</span>
                </div>
              ) : currentBucket.meals.length + finishedToday.length > 0 ? (
                <p className="text-[11px] text-ink-3">
                  {range === "all" ? (
                    <>
                      共 <span className="tabular-nums font-medium text-ink-2">{currentBucket.meals.length + finishedToday.length}</span> 餐
                    </>
                  ) : (
                    <>
                      {RANGE_OPTIONS.find((o) => o.key === range)?.label} ·{" "}
                      <span className="tabular-nums font-medium text-ink-2">{currentBucket.meals.length + finishedToday.length}</span> 餐
                    </>
                  )}
                  {currentBucket.hasMore && <span className="ml-1 text-ink-3">（下滑加载更多）</span>}
                </p>
              ) : (
                <p className="text-[11px] text-ink-3">暂无记录</p>
              )}
            </div>
          </div>

          {me && (
            <button
              type="button"
              aria-label={`${me.displayName}，点此退出登录`}
              onClick={() =>
                confirm({
                  title: `退出 ${me.displayName}？`,
                  confirmText: "退出",
                  onConfirm: () => void doLogout(),
                })
              }
              className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-card py-1 pr-3 pl-1 transition active:scale-95"
            >
              <Avatar name={me.displayName} className="size-[26px] text-[12px]" />
              <span className="text-left leading-tight">
                <span className="block text-[12px] text-ink">{me.displayName}</span>
                <span className="block text-[9.5px] text-ink-3">
                  {me.role === "owner" ? "厨神" : "客人"}
                </span>
              </span>
            </button>
          )}
        </div>

        {/* 顶部时间跨度胶囊 */}
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {RANGE_OPTIONS.map((opt) => {
            const active = range === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleSelectTab(opt.key)}
                className={cn(
                  ui.chip,
                  active ? ui.chipOn : ui.chipOff,
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── 跟手 ViewPager 轨道：支持拖拽到一半实时露出一半相邻页面 ──────────────── */}
      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        className="relative flex-1 w-full overflow-hidden touch-pan-y"
      >
        <div
          ref={trackRef}
          style={{
            transform: `translate3d(calc(${-activeIndex * (100 / RANGE_OPTIONS.length)}% + ${dragOffset}px), 0, 0)`,
            transition: isDragging ? "none" : "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)",
            width: `${RANGE_OPTIONS.length * 100}%`,
          }}
          className="flex h-full will-change-transform"
        >
          {RANGE_OPTIONS.map((opt) => (
            <div key={opt.key} className="h-full w-full flex-1 overflow-hidden">
              <HistoryTabPane
                rangeKey={opt.key}
                data={cache[opt.key]}
                canDeleteRecord={canDelete(me)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 单个时间段 Tab 的独立滚动页面 */
function HistoryTabPane({
  rangeKey,
  data,
  canDeleteRecord,
}: {
  rangeKey: HistoryRange;
  data: RangeData;
  canDeleteRecord: boolean;
}) {
  const loadMoreForRange = useHistory((s) => s.loadMoreForRange);
  const ensureRange = useHistory((s) => s.ensureRange);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 触底流式翻页加载
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !data.hasMore || data.loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMoreForRange(rangeKey);
        }
      },
      { rootMargin: "300px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [data.hasMore, data.loadingMore, rangeKey, loadMoreForRange]);

  const { meals: fetched, loading, loadingMore, hasMore, error, initialized } = data;
  // 今天已经过了饭点的那几顿（还在实时快照里），排在最上面
  const { finishedToday } = useMealsSplit();
  const meals = finishedToday.length ? [...finishedToday, ...fetched] : fetched;

  return (
    <div className="no-scrollbar h-full overflow-y-auto px-4 pt-3 pb-24 overscroll-contain">
      {/* 正在加载骨架屏 */}
      {loading && meals.length === 0 && (
        <div className="flex flex-col gap-3 pb-4">
          <MealCardSkeleton />
          <MealCardSkeleton />
        </div>
      )}

      {error && !loading && (
        <Placeholder text={error} retry={() => void ensureRange(rangeKey, true)} />
      )}

      {initialized && !loading && !error && meals.length === 0 && (
        <Placeholder
          text={rangeKey === "all" ? "还没有记录" : `${RANGE_OPTIONS.find((o) => o.key === rangeKey)?.label}暂无记录`}
          hint={rangeKey === "all" ? "吃过的订单会出现在这里" : "可以切换到「全部」查看更早的订单"}
        />
      )}

      <div className="flex flex-col gap-3 pb-4">
        {meals.map((m) => (
          <MealCard key={m.id} meal={m} canDelete={canDeleteRecord} />
        ))}
      </div>

      {/* 底部触底指示器 */}
      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-4">
          {loadingMore ? (
            <div className="flex items-center gap-2 text-[11.5px] text-ink-3">
              <SpinnerGap size={14} className="animate-spin text-accent" />
              <span>加载更多订单…</span>
            </div>
          ) : (
            <span className="h-4 w-full" aria-hidden="true" />
          )}
        </div>
      )}

      {!hasMore && meals.length >= 15 && (
        <p className="py-6 text-center text-[10.5px] tracking-wider text-ink-3">
          — 没有更早的订单了 —
        </p>
      )}
    </div>
  );
}

function MealCard({ meal, canDelete: allowed }: { meal: Meal; canDelete: boolean }) {
  const removeMeal = useHistory((s) => s.remove);
  const add = useCart((s) => s.add);

  const again = useGuard(() => {
    haptic();
    const rows = meal.items.filter((i) => getDish(i.dishId));
    for (const i of rows) add(i.dishId, i.qty);
    toast(`已把这 ${rows.length} 道菜加回点菜单`);
  }, 1500);

  return (
    <MealTicket
      meal={meal}
      onDelete={allowed ? () => removeMeal(meal.id) : undefined}
      footerAction={
        <button type="button" onClick={again} className={cn(ui.chip, ui.chipSoft)}>
          <ArrowCounterClockwise size={12} weight="bold" />
          再点一次
        </button>
      }
    />
  );
}

/**
 * 历史小票骨架屏：首屏或切 Tab 加载时 1:1 模拟真实小票的物理排版
 * 带有纸墨微光（Shimmer）动画
 */
function MealCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-card px-4 pt-4 pb-3">
      <span aria-hidden className="shimmer absolute inset-0 opacity-70" />

      {/* 小票抬头骨架 */}
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <div className="h-4 w-28 rounded-md bg-paper-2" />
            <div className="h-3 w-12 rounded bg-paper-2/60" />
          </div>
          <div className="h-2.5 w-16 rounded bg-paper-2/50" />
        </div>
      </div>

      <div className="mt-3.5 border-t border-dashed border-line-2" />

      {/* 菜品条目骨架：模拟 2 道菜 */}
      <div className="space-y-3 py-2.5">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-10 shrink-0 rounded-md bg-paper-2" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 rounded bg-paper-2" />
              <div className="h-2.5 w-14 rounded bg-paper-2/60" />
            </div>
            <div className="h-3 w-6 rounded bg-paper-2/50" />
          </div>
        ))}
      </div>

      {/* 小票底部合计与按钮骨架 */}
      <div className="mt-1 flex items-center justify-between border-t border-dashed border-line-2 pt-3">
        <div className="h-3 w-24 rounded bg-paper-2/60" />
        <div className="h-7 w-20 rounded-full bg-paper-2/80" />
      </div>
    </div>
  );
}

function Placeholder({
  text,
  hint,
  retry,
}: {
  text: string;
  hint?: string;
  retry?: () => void;
}) {
  const setActiveTab = useTabs((s) => s.setActiveTab);
  return (
    <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-2 py-20 text-center">
      <p className="font-display text-[15px] tracking-wider text-ink-3">{text}</p>
      {hint && <p className="mt-2 px-10 text-[11px] leading-relaxed text-ink-3">{hint}</p>}
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-full border border-line bg-card px-4 py-1.5 text-[11.5px] text-ink-2"
        >
          重试
        </button>
      )}
      {!retry && !hint && null}
      {!retry && hint && (
        <Link
          href="/menu/"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab("menu");
          }}
          className="mt-5 rounded-full bg-accent px-5 py-2 text-[12px] text-white"
        >
          去点菜
        </Link>
      )}
    </div>
  );
}
