/**
 * 订单的读取拼装：实时快照（kitchen-do.ts）和历史分页（index.ts）共用。
 * SQL 里 meal 别名 m、meal_item 别名 i、user 别名 u（LEFT JOIN 取显示名）。
 */
import type { Slot } from "../src/lib/meal-time";
import type { Meal, MealItem } from "../src/lib/protocol";
import { normalizeName } from "./auth";

export const MEAL_COLS = `m.id, m.meal_date AS mealDate, m.slot, m.rev, m.ordered_at AS orderedAt,
       m.updated_at AS updatedAt, u.display_name AS orderedBy`;

export const ITEM_COLS = `i.meal_id AS mealId, i.dish_id AS dishId, i.qty,
       i.added_by AS addedById, u.display_name AS addedBy`;

export type MealRow = {
  id: string;
  mealDate: string;
  slot: number;
  rev: number;
  orderedAt: number;
  updatedAt: number | null;
  orderedBy: string | null;
};

export type ItemRow = {
  mealId: string;
  dishId: string;
  qty: number;
  addedById: string | null;
  addedBy: string | null;
};

/** 订单行 + 明细行 → Meal[]，保持 meals 的顺序，明细按 items 的顺序 */
export function assembleMeals(meals: MealRow[], items: ItemRow[]): Meal[] {
  const byMeal = new Map<string, MealItem[]>();
  for (const r of items) {
    const arr = byMeal.get(r.mealId) ?? [];
    arr.push({ dishId: r.dishId, qty: r.qty, addedById: r.addedById, addedBy: normalizeName(r.addedBy) });
    byMeal.set(r.mealId, arr);
  }
  return meals.map((m) => ({
    id: m.id,
    mealDate: m.mealDate,
    slot: m.slot as Slot,
    rev: m.rev,
    orderedAt: m.orderedAt,
    orderedBy: normalizeName(m.orderedBy),
    updatedAt: m.updatedAt ?? m.orderedAt,
    items: byMeal.get(m.id) ?? [],
  }));
}
