"use client";

import { useMemo, useState } from "react";
import { Flame, PencilSimple } from "@phosphor-icons/react";
import { getDish } from "@/data/dishes";
import { dayLabel, mealTitle, shortDate } from "@/lib/meal-time";
import { usePrepUi, type PrepSeg } from "@/lib/prep-store";
import type { Meal } from "@/lib/protocol";
import { useCart } from "@/lib/store";
import { useTabs } from "@/lib/tab-store";
import { spicyLabel } from "@/lib/theme";
import { useDishSheet } from "@/lib/ui-store";
import { cn, formatPersonName, haptic } from "@/lib/utils";
import { DishThumb } from "./dish-thumb";
import { openMealEdit } from "./meal-edit-sheet";
import { ShoppingList, useShoppingData } from "./shopping-list";

/** 日期胶囊里「全部」的值 */
const ALL = "all";

/**
 * 备菜页：后厨挂单。就餐日期 >= 今天的订单，一餐一张挂单；另一个分段是它们合起来的买菜清单。
 * 订单编辑面板由 tabs-host 全局挂一份，这里只管 openMealEdit。
 */
export function PrepView() {
  const meals = useCart((s) => s.meals);
  const today = useCart((s) => s.today);
  const seg = usePrepUi((s) => s.seg);
  const setSeg = usePrepUi((s) => s.setSeg);
  // null = 没手动选过，用「最近要做的那天」
  const [picked, setPicked] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...meals].sort((a, b) =>
        a.mealDate === b.mealDate ? a.slot - b.slot : a.mealDate < b.mealDate ? -1 : 1,
      ),
    [meals],
  );
  const days = useMemo(() => [...new Set(sorted.map((m) => m.mealDate))], [sorted]);

  // 选中的那天没订单了（被删 / 过了切日点）就回到最近那天
  const day = picked === ALL ? ALL : picked && days.includes(picked) ? picked : (days[0] ?? ALL);
  const shown = useMemo(
    () => (day === ALL ? sorted : sorted.filter((m) => m.mealDate === day)),
    [sorted, day],
  );

  const shop = useShoppingData(shown);
  const dishCount = shown.reduce((n, m) => n + m.items.length, 0);

  if (sorted.length === 0) {
    return (
      <div className="px-4 pt-4">
        <h1 className="font-display text-[22px] tracking-wider text-ink">备菜</h1>
        <Empty />
      </div>
    );
  }

  const label = (d: string) => dayLabel(d, today) ?? shortDate(d);
  const lead = day === ALL ? "一共要做" : `${label(day)}要做`;
  const left = shop.total - shop.done;

  return (
    <div className="px-4 pt-4 pb-8">
      <header>
        <h1 className="font-display text-[22px] tracking-wider text-ink">备菜</h1>
        <p className="mt-1 text-[11px] text-ink-3">
          {lead} <span className="tabular-nums font-medium text-ink-2">{shown.length}</span> 餐 ·{" "}
          <span className="tabular-nums font-medium text-ink-2">{dishCount}</span> 道
          {shop.total > 0 &&
            (left > 0 ? (
              <>
                {" "}
                · 还差 <span className="tabular-nums font-medium text-ink-2">{left}</span> 样没买
              </>
            ) : (
              " · 都买齐了"
            ))}
        </p>
      </header>

      {/* 吸顶：日期筛选 + 分段切换，同时作用于两种视图 */}
      <div className="sticky top-0 z-20 -mx-4 mt-3 bg-paper/90 px-4 pt-1 pb-2.5 backdrop-blur-lg hairline-b">
        {days.length > 1 && (
          <div
            role="radiogroup"
            aria-label="按天筛选"
            className="no-scrollbar -mx-4 mb-2.5 flex gap-2 overflow-x-auto px-4"
          >
            {[ALL, ...days].map((d) => {
              const on = d === day;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    haptic(6);
                    setPicked(d);
                  }}
                  className={cn(
                    "shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] transition-all duration-200 active:scale-95",
                    on
                      ? "border-accent bg-accent font-medium text-white shadow-2xs"
                      : "border-line bg-card text-ink-2",
                  )}
                >
                  {d === ALL ? "全部" : label(d)}
                </button>
              );
            })}
          </div>
        )}

        <div role="tablist" aria-label="备菜视图" className="grid grid-cols-2 rounded-full bg-paper-2 p-0.5">
          <SegButton
            id="dishes"
            current={seg}
            onPick={setSeg}
            text="要做的菜"
            badge={String(dishCount)}
          />
          <SegButton
            id="shop"
            current={seg}
            onPick={setSeg}
            text="买菜清单"
            badge={shop.total > 0 ? `${shop.done}/${shop.total}` : undefined}
          />
        </div>
      </div>

      <div className="mt-3.5">
        {seg === "dishes" ? (
          <div className="flex flex-col gap-3">
            {shown.map((m) => (
              <OrderTicket key={m.id} meal={m} today={today} />
            ))}
          </div>
        ) : (
          <ShoppingList meals={shown} />
        )}
      </div>
    </div>
  );
}

function SegButton({
  id,
  current,
  onPick,
  text,
  badge,
}: {
  id: PrepSeg;
  current: PrepSeg;
  onPick: (s: PrepSeg) => void;
  text: string;
  badge?: string;
}) {
  const on = current === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={() => {
        if (on) return;
        haptic(6);
        onPick(id);
      }}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-full py-1.5 text-[12.5px] transition",
        on ? "bg-card font-medium text-ink shadow-2xs" : "text-ink-3",
      )}
    >
      {text}
      {badge && <span className="text-[10.5px] tabular-nums text-ink-3">{badge}</span>}
    </button>
  );
}

/** 一餐一张挂单：单头 = 哪天哪餐 + 修改；单身 = 菜；单尾 = 谁点的 */
function OrderTicket({ meal, today }: { meal: Meal; today: string }) {
  const openSheet = useDishSheet((s) => s.open);
  const title = mealTitle(meal.mealDate, meal.slot, today);

  const rows = meal.items
    .map((i) => ({ i, dish: getDish(i.dishId) }))
    .filter((r): r is { i: typeof r.i; dish: NonNullable<typeof r.dish> } => !!r.dish);
  const by = meal.orderedBy ? formatPersonName(meal.orderedBy) : null;

  return (
    <article className="relative overflow-hidden rounded-card border border-line bg-card px-4 pt-3.5 pb-3 shadow-2xs">
      {/* 单头 */}
      <header className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate font-display text-[17px] tracking-wider text-ink">{title}</h2>
        <button
          type="button"
          aria-label={`修改${title}`}
          onClick={() => {
            haptic(6);
            openMealEdit(meal);
          }}
          className="-mr-2 grid size-8 shrink-0 place-items-center rounded-full text-ink-3 transition active:scale-90 active:bg-paper-2"
        >
          <PencilSimple size={16} />
        </button>
      </header>

      <Tear className="mt-3" />

      {/* 菜行 */}
      <ul>
        {rows.map(({ i, dish }) => (
          <li key={i.dishId}>
            <button
              type="button"
              onClick={() => {
                haptic(6);
                openSheet(dish.id);
              }}
              className="flex w-full items-center gap-3 py-2 text-left transition active:opacity-60"
            >
              <DishThumb dish={dish} className="size-10 shrink-0 rounded-md" sizes="40px" />
              <p className="min-w-0 flex-1 truncate font-display text-[14.5px] tracking-wide text-ink">
                {dish.name}
              </p>
              {dish.spicy > 0 && (
                <span className="flex shrink-0 items-center gap-0.5 text-[10.5px] text-chili">
                  <Flame size={11} weight="fill" />
                  {spicyLabel[dish.spicy]}
                </span>
              )}
              <span className="w-7 shrink-0 text-right text-[13px] text-ink tabular-nums">
                ×{i.qty}
              </span>
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-4 text-center text-[12px] text-ink-3">这一餐还没有菜</li>
        )}
      </ul>

      <Tear className="mt-1" />

      {/* 单尾 */}
      <p className="pt-2.5 text-[11px] text-ink-3">
        {by && `${by} 点的 · `}
        <span className="tabular-nums text-ink-2">{rows.length}</span> 道
      </p>
    </article>
  );
}

/** 小票撕口：通栏虚线，两端各咬掉半个圆 */
function Tear({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative -mx-4 border-t border-dashed border-line-2", className)}>
      <span className="absolute -top-[6px] -left-[6px] size-3 rounded-full border border-line bg-paper" />
      <span className="absolute -top-[6px] -right-[6px] size-3 rounded-full border border-line bg-paper" />
    </div>
  );
}

function Empty() {
  const setActiveTab = useTabs((s) => s.setActiveTab);
  return (
    <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-2 py-20 text-center">
      <p className="font-display text-[15px] tracking-wider text-ink-3">还没有要做的菜</p>
      <button
        type="button"
        onClick={() => {
          haptic(6);
          setActiveTab("menu");
        }}
        className="mt-5 rounded-full bg-accent px-5 py-2 text-[12px] text-white transition active:scale-95"
      >
        去点菜
      </button>
    </div>
  );
}
