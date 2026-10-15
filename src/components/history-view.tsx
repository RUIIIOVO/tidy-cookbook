"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowCounterClockwise, CaretDown, SpinnerGap, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { getDish } from "@/data/dishes";
import { canDelete, useAuth } from "@/lib/auth-store";
import { useConfirm } from "@/lib/confirm-store";
import { RANGE_OPTIONS, useHistory, type Meal } from "@/lib/history-store";
import { useCart } from "@/lib/store";
import { useTabs } from "@/lib/tab-store";
import { useDishSheet } from "@/lib/ui-store";
import { cn, formatPersonName, haptic } from "@/lib/utils";
import { useGuard } from "@/lib/use-guard";
import { Avatar } from "./avatar";
import { DishThumb } from "./dish-thumb";

export function HistoryView() {
  const me = useAuth((s) => s.me);
  const doLogout = useAuth((s) => s.logout);
  const meals = useHistory((s) => s.meals);
  const loading = useHistory((s) => s.loading);
  const loadingMore = useHistory((s) => s.loadingMore);
  const hasMore = useHistory((s) => s.hasMore);
  const error = useHistory((s) => s.error);
  const range = useHistory((s) => s.range);
  const setRange = useHistory((s) => s.setRange);
  const load = useHistory((s) => s.load);
  const loadMore = useHistory((s) => s.loadMore);
  const confirm = useConfirm((s) => s.confirm);
  const locked = useCart((s) => s.locked);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // 锁单会在服务端归档出一条新记录，此时重拉一次
  useEffect(() => {
    if (locked) void load();
  }, [locked, load]);

  // 触底自动触发下一页流式懒加载
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "300px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div className="px-4 pt-4">
      {/* 顶部吸顶栏：下滑滚动时标题栏与时间筛选 Tab 常驻顶部，毛玻璃穿透 */}
      <header className="sticky top-0 z-20 -mx-4 -mt-4 bg-paper/90 px-4 pt-4 pb-3 backdrop-blur-lg hairline-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[22px] tracking-wider text-ink">历史订单</h1>
            {/* 恒定高度容器，彻底消除切 Tab 时高度塌陷引发的页面抖动跳跃 */}
            <div className="mt-1 min-h-[18px]">
              {loading && meals.length === 0 ? (
                <p className="text-[11px] text-ink-3">读取中…</p>
              ) : meals.length > 0 ? (
                <p className="text-[11px] text-ink-3">
                  {range === "all" ? (
                    <>
                      共 <span className="tabular-nums font-medium text-ink-2">{meals.length}</span> 餐
                    </>
                  ) : (
                    <>
                      {RANGE_OPTIONS.find((o) => o.key === range)?.label} ·{" "}
                      <span className="tabular-nums font-medium text-ink-2">{meals.length}</span> 餐
                    </>
                  )}
                  {hasMore && <span className="ml-1 text-ink-3">（下滑加载更多）</span>}
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

        {/* 顶部时间跨度筛选：与首页抽菜分类一致的 rounded-full 独立胶囊形态 */}
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {RANGE_OPTIONS.map((opt) => {
            const active = range === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  haptic(6);
                  setRange(opt.key);
                }}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] transition",
                  active
                    ? "border-accent bg-accent font-medium text-white shadow-2xs"
                    : "border-line bg-card text-ink-2 active:bg-paper",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </header>

      {loading && meals.length === 0 && <Placeholder text="读取中…" />}
      {error && !loading && <Placeholder text={error} retry={load} />}
      {!loading && !error && meals.length === 0 && (
        <Placeholder
          text={range === "all" ? "还没有记录" : `${RANGE_OPTIONS.find((o) => o.key === range)?.label}暂无记录`}
          hint={range === "all" ? "锁单后会自动归档到这里" : "可以切换到「全部」查看更早的订单"}
        />
      )}

      <div className="mt-4 flex flex-col gap-3 pb-4">
        {meals.map((m) => (
          <MealCard key={m.id} meal={m} canDelete={canDelete(me)} />
        ))}
      </div>

      {/* 底部触底哨兵 & 加载指示器 */}
      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-4">
          {loadingMore ? (
            <div className="flex items-center gap-2 text-[11.5px] text-ink-3">
              <SpinnerGap size={14} className="animate-spin text-accent" />
              <span>加载更多历史订单…</span>
            </div>
          ) : (
            <span className="h-4 w-full" aria-hidden="true" />
          )}
        </div>
      )}

      {!hasMore && meals.length >= 15 && (
        <p className="py-6 text-center text-[10.5px] tracking-wider text-ink-3">
          — 已展示全部历史订单 —
        </p>
      )}
    </div>
  );
}

function MealCard({ meal, canDelete: allowed }: { meal: Meal; canDelete: boolean }) {
  const removeMeal = useHistory((s) => s.remove);
  const confirm = useConfirm((s) => s.confirm);
  const add = useCart((s) => s.add);
  const locked = useCart((s) => s.locked);
  const openSheet = useDishSheet((s) => s.open);

  const rows = meal.items
    .map((i) => ({ i, dish: getDish(i.dishId) }))
    .filter((r): r is { i: typeof r.i; dish: NonNullable<typeof r.dish> } => !!r.dish);

  const total = meal.items.reduce((n, i) => n + i.qty, 0);

  const again = useGuard(() => {
    if (locked) {
      toast("当前这一餐已经定了，想改先点「重新编辑」");
      return;
    }
    haptic();
    for (const { i } of rows) add(i.dishId, i.qty);
    toast(`已把这 ${rows.length} 道菜加回点菜单`);
  }, 1500);

  const people = [
    ...new Set(
      meal.items
        .map((i) => (i.addedBy ? formatPersonName(i.addedBy) : null))
        .filter((n): n is string => !!n),
    ),
  ];
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, FOLD_AT);
  const hidden = rows.length - FOLD_AT;
  const { day, time } = formatDate(meal.orderedAt);

  return (
    <article className="rounded-card border border-line bg-card px-4 pt-4 pb-3">
      {/* 小票抬头 */}
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="font-display text-[17px] tracking-wider text-ink">{day}</span>
            <span className="text-[11px] text-ink-3 tabular-nums">{time}</span>
          </p>
          <p className="mt-1 truncate text-[10.5px] text-ink-3">
            {meal.orderedBy
              ? `${formatPersonName(meal.orderedBy)} 下单`
              : people.length > 0
                ? `${people.join("、")} 下单`
                : "已归档"}
          </p>
        </div>
        {allowed && (
          <button
            type="button"
            aria-label="删除这一餐"
            onClick={() =>
              confirm({
                title: `删除 ${day} ${time}\n这一餐的记录？`,
                confirmText: "删除",
                onConfirm: () => {
                  void removeMeal(meal.id).then((ok) => {
                    if (!ok) toast("删除失败，请稍后再试");
                  });
                },
              })
            }
            className="-mt-1 -mr-2 grid size-8 shrink-0 place-items-center rounded-full text-ink-3 transition active:scale-90 active:bg-paper-2"
          >
            <Trash size={15} />
          </button>
        )}
      </header>

      <div className="mt-3 border-t border-dashed border-line-2" />

      {/* 明细：一行一道菜 */}
      <ul>
        {shown.map(({ i, dish }) => (
          <li key={i.dishId}>
            <button
              type="button"
              onClick={() => openSheet(dish.id)}
              className="flex w-full items-center gap-3 py-2 text-left transition active:opacity-60"
            >
              <DishThumb dish={dish} className="size-10 shrink-0 rounded-md" sizes="40px" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[14px] tracking-wide text-ink">
                  {dish.name}
                </p>
                {i.addedBy && (
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-3">
                    <Avatar
                      name={formatPersonName(i.addedBy)}
                      className="size-[12px] text-[7.5px]"
                    />
                    <span className="truncate">{formatPersonName(i.addedBy)}</span>
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[12px] text-ink-2 tabular-nums">×{i.qty}</span>
            </button>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-center gap-1 py-1.5 text-[11px] text-ink-3 transition active:opacity-60"
        >
          {open ? "收起" : `展开其余 ${hidden} 道`}
          <CaretDown size={11} className={cn("transition-transform", open && "rotate-180")} />
        </button>
      )}

      {/* 小票合计 */}
      <div className="mt-1 flex items-center justify-between border-t border-dashed border-line-2 pt-3">
        <span className="text-[11px] text-ink-3">
          合计 <span className="tabular-nums text-ink-2">{rows.length}</span> 道 ·{" "}
          <span className="tabular-nums text-ink-2">{total}</span> 份
        </span>
        <button
          type="button"
          onClick={again}
          className="flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-[11.5px] text-accent transition active:scale-95"
        >
          <ArrowCounterClockwise size={12} weight="bold" />
          再点一次
        </button>
      </div>
    </article>
  );
}

const FOLD_AT = 3;

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
          去翻菜单
        </Link>
      )}
    </div>
  );
}

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function formatDate(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;
  if (sameDay) return { day: "今天", time };
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  )
    return { day: "昨天", time };
  const y = d.getFullYear() === now.getFullYear() ? "" : `${d.getFullYear()}/`;
  return { day: `${y}${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`, time };
}
