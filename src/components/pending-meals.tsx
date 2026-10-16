"use client";

import { ForkKnife, PencilSimple } from "@phosphor-icons/react";
import { getDish } from "@/data/dishes";
import { mealTitle } from "@/lib/meal-time";
import type { Meal } from "@/lib/protocol";
import { useCart } from "@/lib/store";
import { formatPersonName, haptic } from "@/lib/utils";
import { DishThumb } from "./dish-thumb";
import { MealEditSheet, openMealEdit } from "./meal-edit-sheet";
import { ShoppingList } from "./shopping-list";

/** 缩略图最多显示几张 */
const THUMBS = 4;

/**
 * 「待吃」分组：就餐日期 >= 今天的订单，所有人都能改。下面跟着买菜清单。
 * 没有待吃订单时不画任何东西。
 * 订单编辑面板（MealEditSheet）也挂在这里 —— 全局只此一份，历史卡片的「修改」同样走它。
 */
export function PendingMeals() {
  const meals = useCart((s) => s.meals);

  return (
    <>
      <MealEditSheet />
      {meals.length > 0 && (
        <section className="pb-1">
          <div className="mb-2.5 flex items-center gap-2">
            <ForkKnife size={16} weight="regular" className="text-ink" />
            <h2 className="font-display text-[15px] tracking-[0.22em] text-ink">待吃</h2>
            <span className="text-[10px] text-ink-3 tabular-nums">{meals.length} 单</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="flex flex-col gap-2.5">
            {meals.map((m) => (
              <PendingCard key={m.id} meal={m} />
            ))}
          </div>
          <ShoppingList meals={meals} />
          <p className="mt-6 mb-1 flex items-center gap-2 text-[10.5px] tracking-[0.22em] text-ink-3">
            <span className="h-px flex-1 bg-line" />
            已吃
            <span className="h-px flex-1 bg-line" />
          </p>
        </section>
      )}
    </>
  );
}

function PendingCard({ meal }: { meal: Meal }) {
  const today = useCart((s) => s.today);

  const rows = meal.items
    .map((i) => ({ i, dish: getDish(i.dishId) }))
    .filter((r): r is { i: typeof r.i; dish: NonNullable<typeof r.dish> } => !!r.dish);
  const total = meal.items.reduce((n, i) => n + i.qty, 0);
  const by = meal.orderedBy ? formatPersonName(meal.orderedBy) : null;

  const open = () => {
    haptic(6);
    openMealEdit(meal);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-card px-3.5 py-3 shadow-2xs transition active:border-line-2 active:bg-paper"
    >
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-[16px] leading-tight tracking-wider text-ink">
          {mealTitle(meal.mealDate, meal.slot, today)}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-[1.55] text-ink-2">
          {rows.length > 0
            ? rows.map(({ i, dish }) => (i.qty > 1 ? `${dish.name} ×${i.qty}` : dish.name)).join("、")
            : "还没有菜"}
        </p>
        <div className="mt-2 flex items-center gap-2">
          {rows.length > 0 && (
            <div className="flex -space-x-1.5">
              {rows.slice(0, THUMBS).map(({ dish }) => (
                <DishThumb
                  key={dish.id}
                  dish={dish}
                  className="size-6 shrink-0 rounded-full ring-2 ring-card"
                  sizes="24px"
                />
              ))}
            </div>
          )}
          <span className="truncate text-[10.5px] text-ink-3">
            <span className="tabular-nums">{rows.length}</span> 道 ·{" "}
            <span className="tabular-nums">{total}</span> 份{by && ` · ${by} 下单`}
          </span>
        </div>
      </div>
      <button
        type="button"
        aria-label={`修改${mealTitle(meal.mealDate, meal.slot, today)}`}
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
        className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-[11.5px] text-accent transition active:scale-95"
      >
        <PencilSimple size={12} weight="bold" />
        修改
      </button>
    </div>
  );
}
