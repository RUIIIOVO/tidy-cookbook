"use client";

import { useMemo, useState } from "react";
import { ClipboardText, Flame } from "@phosphor-icons/react";
import { motion, useMotionValueEvent, useTransform } from "motion/react";
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
import { GroupCard, GroupRow, GroupSection } from "./grouped-list";
import { MealCardActions } from "./meal-card-actions";
import { deleteMeal } from "@/lib/meal-actions";
import { ShoppingList, useShoppingData } from "./shopping-list";
import { SwipePanels, usePager, type Pager } from "./swipe-panels";

/** 日期胶囊里「全部」的值 */
const ALL = "all";

const SEGS: PrepSeg[] = ["dishes", "shop"];

/**
 * 备菜页：就餐日期 >= 今天的订单。两个并排的视图——菜品（一餐一组）和买菜清单，
 * 顶部文字标签 + 下划线切换，也可以左右滑动。
 * 订单编辑面板由 tabs-host 全局挂一份，这里只管 openMealEdit。
 */
export function PrepView() {
  const meals = useCart((s) => s.meals);
  const today = useCart((s) => s.today);
  const seg = usePrepUi((s) => s.seg);
  const setSeg = usePrepUi((s) => s.setSeg);
  // null = 没手动选过，用「最近要做的那天」
  const [picked, setPicked] = useState<string | null>(null);

  const index = SEGS.indexOf(seg);
  const pager = usePager(index);

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

  if (sorted.length === 0) {
    return (
      <div className="px-4 pt-4">
        <h1 className="font-display text-[22px] tracking-wider text-ink">备菜</h1>
        <Empty />
      </div>
    );
  }

  const dishCount = shown.reduce((n, m) => n + m.items.length, 0);
  const left = shop.total - shop.done;
  const label = (d: string) => dayLabel(d, today) ?? shortDate(d);

  const pick = (i: number) => {
    if (i === index) return;
    haptic(6);
    pager.snapTo(i);
    setSeg(SEGS[i]);
  };

  return (
    <div className="pb-8">
      <header className="px-4 pt-4 pb-1">
        <h1 className="font-display text-[22px] tracking-wider text-ink">备菜</h1>
        <p className="mt-1 text-[12px] text-ink-3">
          <span className="tabular-nums text-ink-2">{shown.length}</span> 餐 ·{" "}
          <span className="tabular-nums text-ink-2">{dishCount}</span> 道菜
          {shop.total > 0 &&
            (left > 0 ? (
              <>
                {" "}
                · <span className="tabular-nums text-ink-2">{left}</span> 样没买
              </>
            ) : (
              " · 菜买齐了"
            ))}
        </p>
      </header>

      {/* 吸顶：文字标签 + 日期筛选，同时作用于两个视图 */}
      <div className="sticky top-0 z-20 bg-paper/90 backdrop-blur-lg hairline-b">
        <PrepTabs
          pager={pager}
          index={index}
          onPick={pick}
          items={[
            { text: "菜品", badge: String(dishCount) },
            { text: "买菜清单", badge: shop.total > 0 ? `${shop.done}/${shop.total}` : undefined },
          ]}
        />
        {days.length > 1 && (
          <div
            role="radiogroup"
            aria-label="按天筛选"
            className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-0.5 pb-2.5"
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
                    if (on) return;
                    haptic(6);
                    setPicked(d);
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-[12px] transition-colors duration-200 active:scale-95",
                    on ? "bg-accent-soft font-medium text-accent" : "bg-paper-2 text-ink-2",
                  )}
                >
                  {d === ALL ? "全部" : label(d)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <SwipePanels
        pager={pager}
        index={index}
        onIndexChange={(i) => setSeg(SEGS[i])}
        panels={[
          <div key="dishes" className="px-4 pt-3 pb-4">
            <DishGroups meals={shown} today={today} />
          </div>,
          <div key="shop" className="px-4 pt-3 pb-4">
            <ShoppingList meals={shown} />
          </div>,
        ]}
      />
    </div>
  );
}

/** 文字标签 + 下划线；下划线直接订阅手势进度，跟手平移 */
function PrepTabs({
  pager,
  index,
  onPick,
  items,
}: {
  pager: Pager;
  index: number;
  onPick: (i: number) => void;
  items: { text: string; badge?: string }[];
}) {
  // 手势拖过一半时文字就切到新页的强调态，不必等松手
  const [near, setNear] = useState(index);
  useMotionValueEvent(pager.pos, "change", (v) => setNear(v >= 0.5 ? 1 : 0));
  const underlineX = useTransform(pager.pos, (p) => `${p * 100}%`);

  return (
    <div role="tablist" aria-label="备菜视图" className="relative grid grid-cols-2">
      {items.map((it, i) => (
        <button
          key={it.text}
          type="button"
          role="tab"
          aria-selected={i === index}
          onClick={() => onPick(i)}
          className={cn(
            "py-3 text-[15px] font-medium transition-colors active:opacity-60",
            i === near ? "text-ink" : "text-ink-3",
          )}
        >
          {it.text}
          {it.badge && (
            <span className="ml-1 text-[12px] font-normal tabular-nums">{it.badge}</span>
          )}
        </button>
      ))}
      <motion.div
        aria-hidden
        style={{ x: underlineX }}
        className="pointer-events-none absolute bottom-0 left-0 flex w-1/2 justify-center"
      >
        <span className="h-[3px] w-6 rounded-full bg-accent" />
      </motion.div>
    </div>
  );
}

/** 菜品视图：每餐一组，标题在卡片外 */
function DishGroups({ meals, today }: { meals: Meal[]; today: string }) {
  const openSheet = useDishSheet((s) => s.open);

  return (
    <div className="flex flex-col gap-5">
      {meals.map((meal) => {
        const title = mealTitle(meal.mealDate, meal.slot, today);
        const by = meal.orderedBy ? formatPersonName(meal.orderedBy) : null;
        const rows = meal.items
          .map((i) => ({ i, dish: getDish(i.dishId) }))
          .filter((r): r is { i: typeof r.i; dish: NonNullable<typeof r.dish> } => !!r.dish);

        return (
          <GroupSection
            key={meal.id}
            title={title}
            aside={
              <>
                {by && <span>{by} 点的</span>}
                <MealCardActions
                  meal={meal}
                  title={title}
                  onDelete={async () => (await deleteMeal({ mealId: meal.id, date: meal.mealDate })).ok}
                />
              </>
            }
          >
            <GroupCard>
              {rows.map(({ i, dish }, idx) => (
                <GroupRow key={i.dishId} last={idx === rows.length - 1} inset={66}>
                  <button
                    type="button"
                    onClick={() => {
                      haptic(6);
                      openSheet(dish.id);
                    }}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition active:bg-paper"
                  >
                    <DishThumb dish={dish} className="size-10 shrink-0 rounded-lg" sizes="40px" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[15px] tracking-wide text-ink">
                        {dish.name}
                      </span>
                      {dish.spicy > 0 && (
                        <span className="mt-0.5 flex items-center gap-0.5 text-[11px] text-chili">
                          <Flame size={11} weight="fill" />
                          {spicyLabel[dish.spicy]}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[13px] text-ink-2 tabular-nums">×{i.qty}</span>
                  </button>
                </GroupRow>
              ))}
              {rows.length === 0 && (
                <li className="py-5 text-center text-[12px] text-ink-3">这一餐还没有菜</li>
              )}
            </GroupCard>
          </GroupSection>
        );
      })}
    </div>
  );
}

function Empty() {
  const setActiveTab = useTabs((s) => s.setActiveTab);
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <ClipboardText size={40} weight="light" className="text-ink-3" />
      <p className="mt-4 text-[15px] text-ink-2">还没有订单</p>
      <button
        type="button"
        onClick={() => {
          haptic(6);
          setActiveTab("menu");
        }}
        className="mt-5 rounded-full bg-accent px-6 py-2.5 text-[13px] font-medium text-white transition active:scale-95"
      >
        去点菜
      </button>
    </div>
  );
}
