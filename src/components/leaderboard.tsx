"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Star } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { categories, dishes } from "@/data/dishes";
import type { Dish } from "@/data/types";
import { useDishRatings } from "@/lib/dish-rating-store";
import { useCart } from "@/lib/store";
import { useDishSheet } from "@/lib/ui-store";
import { useBackClose } from "@/lib/use-back-close";
import { cn, haptic } from "@/lib/utils";
import { DishAction } from "./dish-action";
import { DishThumb } from "./dish-thumb";

type Sort = "rating" | "count";
type Cat = "all" | string;

const SORTS: { key: Sort; label: string }[] = [
  { key: "rating", label: "评分" },
  { key: "count", label: "销量" },
];
const SWITCH_W = 72;

type Row = { dish: Dish; avg: number; n: number; count: number; rank: number };

/** 一个榜单（一页）：列表 + 空状态。每页自己滚动，切换 tab 时各记各的位置 */
function BoardPage({
  rows,
  sort,
  cat,
  padBottom,
  listRef,
  width,
}: {
  rows: Row[];
  sort: Sort;
  cat: Cat;
  padBottom: boolean;
  listRef: (el: HTMLDivElement | null) => void;
  /** 每页宽度 = 100% / 分类数（分类数不是固定的，不能写死 1/6） */
  width: string;
}) {
  const openSheet = useDishSheet((s) => s.open);
  const empty =
    sort === "rating"
      ? { title: "还没有评分", hint: "吃完饭给菜打个分，这里就有排名了" }
      : { title: "还没有销量", hint: "下单后，卖得好的菜会在这里排名" };

  return (
    <div ref={listRef} style={{ width }} className="no-scrollbar h-full shrink-0 overflow-y-auto overscroll-contain">
      {rows.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-10 pb-24 text-center">
          <p className="font-display text-[17px] tracking-wider text-ink">
            {cat === "all" ? empty.title : "这个分类还没有上榜的菜"}
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">{empty.hint}</p>
        </div>
      ) : (
        <ul className={cn("px-4 pt-1", padBottom ? "pb-28" : "pb-8")}>
          {rows.map(({ dish, avg, n, count, rank }) => {
            const top = rank <= 3;
            return (
              <li key={dish.id} className="border-b border-line/60 last:border-b-0">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    haptic(6);
                    openSheet(dish.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      openSheet(dish.id);
                    }
                  }}
                  className="flex cursor-pointer items-center gap-3 py-3 transition active:opacity-70"
                >
                  <span
                    className={cn(
                      "w-6 shrink-0 text-center font-display tabular-nums",
                      top ? "text-[22px] leading-none text-caramel" : "text-[15px] text-ink-3",
                    )}
                  >
                    {rank}
                  </span>
                  <DishThumb dish={dish} className="size-14 shrink-0 rounded-[10px]" sizes="56px" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-[15.5px] leading-tight tracking-wide text-ink">
                      {dish.name}
                    </h3>
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-3 tabular-nums">
                      {sort === "rating" ? (
                        <>
                          <span className="inline-flex items-center gap-0.5 text-[12.5px] font-medium text-ink">
                            <Star size={12} weight="fill" className="text-accent" />
                            {avg.toFixed(1)}
                          </span>
                          <span>{n} 次评分</span>
                          {count > 0 && <span>· 销量 {count}</span>}
                        </>
                      ) : (
                        <>
                          <span className="text-[12.5px] font-medium text-caramel">销量 {count}</span>
                          {n > 0 && (
                            <span className="inline-flex items-center gap-0.5">
                              ·
                              <Star size={10} weight="fill" className="text-accent" />
                              {avg.toFixed(1)}
                            </span>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                  <DishAction dish={dish} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * 排行榜：全屏子页面（从右侧推入，和下厨日历同一套做法）。
 * - 评分榜：按单菜平均分，同分依次比评分次数、销量、菜名；只有被单独打过分的菜才上榜
 * - 销量榜：按累计销量，同分依次比平均分、评分次数、菜名；没卖出过的不上榜
 * 两个榜是左右两页，手指可以跟手横滑切换（和订单页的时间段切换一致）；
 * 每页自己在 header 下面滚动，滚动条不会盖到 header。
 * 每行右侧直接是点单按钮，可以一路点下去，底部浮条汇总并跳到点菜单。
 */
export function Leaderboard({
  onClose,
  onGoCart,
}: {
  onClose: () => void;
  /** 点底部「去点菜单」：先关闭本页，再由父级切到点菜单 */
  onGoCart: () => void;
}) {
  const ratings = useDishRatings((s) => s.ratings);
  const refreshRatings = useDishRatings((s) => s.refresh);
  const stats = useCart((s) => s.stats);
  const cartKinds = useCart((s) => s.items.length);

  // 排序（评分 / 销量）用顶部胶囊切换；左右横滑切换的是分类
  const [sort, setSort] = useState<Sort>("rating");
  const [cat, setCat] = useState<Cat>("all");

  // 分类顺序：全部 + 各大类
  const cats = useMemo(() => [{ id: "all" as Cat, name: "全部" }, ...categories.map((c) => ({ id: c.id as Cat, name: c.name }))], []);
  const catIdx = Math.max(0, cats.findIndex((c) => c.id === cat));

  useBackClose(true, onClose);
  useEffect(() => {
    void refreshRatings(true);
  }, [refreshRatings]);

  /** 每个分类各自的榜单（按当前排序方式算） */
  const lists = useMemo(() => {
    const build = (pool: Dish[], by: Sort): Row[] => {
      const list = pool
        .map((dish) => ({
          dish,
          avg: ratings[dish.id]?.avg ?? 0,
          n: ratings[dish.id]?.n ?? 0,
          count: stats[dish.id] || 0,
          rank: 0,
        }))
        .filter((r) => (by === "rating" ? r.n > 0 : r.count > 0));

      list.sort(
        by === "rating"
          ? (a, b) => b.avg - a.avg || b.n - a.n || b.count - a.count || a.dish.name.localeCompare(b.dish.name)
          : (a, b) => b.count - a.count || b.avg - a.avg || b.n - a.n || a.dish.name.localeCompare(b.dish.name),
      );
      // 名次永远 1、2、3…；同分的靠上面的第二、第三排序条件分先后
      list.forEach((r, i) => {
        r.rank = i + 1;
      });
      return list;
    };

    return cats.map((c) => ({
      ...c,
      rows: build(c.id === "all" ? dishes : dishes.filter((d) => d.category === c.id), sort),
    }));
  }, [cats, ratings, stats, sort]);

  // 按分类记住滚动位置：切回来还在原处
  const panes = useRef<(HTMLDivElement | null)[]>([]);
  const positions = useRef<Record<string, number>>({});

  // ── 跟手横滑切换分类 ──
  const pagerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touch = useRef<{ x: number; y: number; t: number; lastT: number; w: number; horiz: boolean | null; dx: number } | null>(null);

  const goCat = (i: number) => {
    const next = Math.max(0, Math.min(cats.length - 1, i));
    if (next === catIdx) return;
    haptic(8);
    // 记住离开的这一页滚到哪了
    positions.current[cat] = panes.current[catIdx]?.scrollTop ?? 0;
    setCat(cats[next].id);
  };

  useEffect(() => {
    // 切到某一页时恢复它自己的滚动位置
    const el = panes.current[catIdx];
    if (el) el.scrollTop = positions.current[cat] ?? 0;
  }, [catIdx, cat]);

  const onTouchStart = (e: React.TouchEvent) => {
    const p = e.touches[0];
    touch.current = {
      x: p.clientX,
      y: p.clientY,
      t: e.timeStamp,
      lastT: e.timeStamp,
      w: pagerRef.current?.offsetWidth || window.innerWidth,
      horiz: null,
      dx: 0,
    };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touch.current;
    if (!s) return;
    const p = e.touches[0];
    const dx = p.clientX - s.x;
    const dy = p.clientY - s.y;
    if (s.horiz === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.horiz = Math.abs(dx) > Math.abs(dy) * 1.15;
      if (s.horiz) setDragging(true);
    }
    if (!s.horiz) return;
    s.lastT = e.timeStamp;
    // 两端继续往外拖给阻力
    const eff = (catIdx === 0 && dx > 0) || (catIdx === cats.length - 1 && dx < 0) ? dx * 0.25 : dx;
    s.dx = eff;
    setDrag(eff);
  };
  const endTouch = (commit: boolean) => {
    const s = touch.current;
    touch.current = null;
    if (commit && s?.horiz) {
      // 甩动速度用两次触摸事件的间隔算，不在这里读时钟
      const v = s.dx / Math.max(1, s.lastT - s.t);
      let to = catIdx;
      if (s.dx < -s.w * 0.2 || (v < -0.3 && s.dx < -20)) to = catIdx + 1;
      else if (s.dx > s.w * 0.2 || (v > 0.3 && s.dx > 20)) to = catIdx - 1;
      goCat(to);
    }
    setDragging(false);
    setDrag(0);
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 40 }}
      className="fixed inset-0 z-50 mx-auto flex max-w-[520px] flex-col overflow-hidden bg-paper select-none"
    >
      {/* 固定在上面：返回 + 标题 + 排序切换。滚动只发生在下面的列表里 */}
      <header className="shrink-0 border-b border-line bg-paper pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="返回"
              onClick={() => {
                haptic(4);
                onClose();
              }}
              className="-ml-1.5 grid size-8 place-items-center rounded-full text-ink transition active:bg-paper-2"
            >
              <ArrowLeft size={19} />
            </button>
            <h1 className="font-display text-[20px] tracking-wider text-ink">排行榜</h1>
          </div>

          {/* 评分 / 销量：滑块平移 */}
          <div className="relative flex rounded-full border border-line bg-card p-1">
            <motion.span
              initial={false}
              animate={{ x: sort === "rating" ? 0 : SWITCH_W }}
              transition={{ type: "spring", stiffness: 480, damping: 38 }}
              style={{ width: SWITCH_W }}
              className="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-accent"
            />
            {SORTS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  haptic(4);
                  setSort(o.key);
                }}
                style={{ width: SWITCH_W }}
                className={cn(
                  "relative py-1 text-center text-[12px] font-medium transition-colors",
                  sort === o.key ? "text-white" : "text-ink-3",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 分类：横滑切换的是这一排；点击也生效 */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
          {cats.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                haptic(6);
                goCat(i);
              }}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] transition",
                cat === c.id ? "border-accent bg-accent text-white" : "border-line bg-card text-ink-2",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </header>

      {/* 每个分类一页，并排成一条轨道，横滑时跟手 */}
      <div
        ref={pagerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => endTouch(true)}
        onTouchCancel={() => endTouch(false)}
        className="relative min-h-0 flex-1 overflow-hidden touch-pan-y"
      >
        <div
          style={{
            width: `${cats.length * 100}%`,
            transform: `translate3d(calc(${-catIdx * (100 / cats.length)}% + ${drag}px), 0, 0)`,
            transition: dragging ? "none" : "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          className="flex h-full will-change-transform"
        >
          {lists.map((c, i) => (
            <BoardPage
              key={c.id}
              rows={c.rows}
              sort={sort}
              cat={c.id}
              padBottom={cartKinds > 0}
              width={`${100 / cats.length}%`}
              listRef={(el) => {
                panes.current[i] = el;
              }}
            />
          ))}
        </div>

        {/* 全屏页盖住了底部导航的购物车角标，这里自带一条汇总 */}
        {cartKinds > 0 && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-paper via-paper/95 to-paper/0 px-4 pt-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => {
                haptic(8);
                onGoCart();
              }}
              className="flex h-12 w-full items-center justify-between rounded-full bg-accent px-5 text-[14px] font-medium tracking-wide text-white shadow-sm transition active:scale-[0.99]"
            >
              <span>已点 {cartKinds} 道</span>
              <span>去点菜单 →</span>
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
