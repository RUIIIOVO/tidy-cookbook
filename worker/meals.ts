/**
 * 订单的读取拼装：实时快照（kitchen-do.ts）和历史分页（index.ts）共用。
 * SQL 里 meal 别名 m、meal_item 别名 i、user 别名 u（LEFT JOIN 取显示名）。
 */
import type { Slot } from "../src/lib/meal-time";
import type { Meal, MealItem, MealReview } from "../src/lib/protocol";
import { normalizeName } from "./auth";

export const MEAL_COLS = `m.id, m.meal_date AS mealDate, m.slot, m.rev, m.ordered_at AS orderedAt,
       m.updated_at AS updatedAt, u.display_name AS orderedBy`;

export const ITEM_COLS = `i.meal_id AS mealId, i.dish_id AS dishId, i.qty,
       i.added_by AS addedById, u.display_name AS addedBy`;

export const REVIEW_COLS = `r.meal_id AS mealId, r.rating, r.rating_text AS ratingText,
       r.tags, r.dish_ratings AS dishRatings, r.comment, r.reviewed_by AS reviewedBy, r.updated_at AS updatedAt`;

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

export type ReviewRow = {
  mealId: string;
  rating: number;
  ratingText: string;
  tags: string | null;
  dishRatings: string | null;
  comment: string | null;
  reviewedBy: string;
  updatedAt: number;
};

/** 订单行 + 明细行 + 点评行 → Meal[]，保持 meals 的顺序，明细按 items 的顺序 */
export function assembleMeals(
  meals: MealRow[],
  items: ItemRow[],
  reviews: ReviewRow[] = [],
): Meal[] {
  const byMeal = new Map<string, MealItem[]>();
  for (const r of items) {
    const arr = byMeal.get(r.mealId) ?? [];
    arr.push({ dishId: r.dishId, qty: r.qty, addedById: r.addedById, addedBy: normalizeName(r.addedBy) });
    byMeal.set(r.mealId, arr);
  }

  const reviewByMeal = new Map<string, MealReview>();
  for (const rv of reviews) {
    let parsedTags: string[] = [];
    try {
      if (rv.tags) parsedTags = JSON.parse(rv.tags);
    } catch {}

    let parsedDishRatings: Record<string, number> = {};
    try {
      if (rv.dishRatings) parsedDishRatings = JSON.parse(rv.dishRatings);
    } catch {}

    reviewByMeal.set(rv.mealId, {
      mealId: rv.mealId,
      rating: rv.rating,
      ratingText: rv.ratingText,
      tags: Array.isArray(parsedTags) ? parsedTags : [],
      dishRatings: parsedDishRatings && typeof parsedDishRatings === "object" ? parsedDishRatings : {},
      comment: rv.comment ?? "",
      reviewedBy: normalizeName(rv.reviewedBy) ?? "家人",
      updatedAt: rv.updatedAt,
    });
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
    review: reviewByMeal.get(m.id) ?? null,
  }));
}
