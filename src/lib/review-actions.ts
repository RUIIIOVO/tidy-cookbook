"use client";

import { authHeaders } from "./auth-store";
import { useHeatmap } from "./heatmap-store";
import { useHistory } from "./history-store";
import type { MealReview } from "./protocol";

/** 5 档评级：星级 → 文案 */
export const RATING_LEVELS: { rating: number; text: string }[] = [
  { rating: 5, text: "夯爆了" },
  { rating: 4, text: "顶级" },
  { rating: 3, text: "人上人" },
  { rating: 2, text: "NPC" },
  { rating: 1, text: "拉完了" },
];

export const ratingText = (r: number) => RATING_LEVELS.find((l) => l.rating === r)?.text ?? "";

export type ReviewDraft = {
  rating: number;
  tags: string[];
  dishRatings: Record<string, number>;
  comment: string;
};

async function call(method: "POST" | "DELETE", body: unknown) {
  const res = await fetch("/api/reviews", {
    method,
    credentials: "same-origin",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error || "操作失败，请重试");
  }
  return res.json();
}

/** 保存（新建或覆盖）一餐的点评 */
export async function saveReview(mealId: string, draft: ReviewDraft): Promise<MealReview> {
  // 没打分的菜（0）不上传
  const dishRatings = Object.fromEntries(Object.entries(draft.dishRatings).filter(([, v]) => v > 0));
  const json = (await call("POST", {
    mealId,
    rating: draft.rating,
    ratingText: ratingText(draft.rating),
    tags: draft.tags,
    dishRatings,
    comment: draft.comment.trim(),
  })) as { review: MealReview };
  useHistory.getState().updateReview(mealId, json.review);
  void useHeatmap.getState().refresh();
  return json.review;
}

/** 删除一餐的点评 */
export async function deleteReview(mealId: string): Promise<void> {
  await call("DELETE", { mealId });
  useHistory.getState().updateReview(mealId, null);
  void useHeatmap.getState().refresh();
}

/** 批量补拉点评（今天已吃完的几餐来自实时快照，快照里没有点评） */
export async function fetchReviews(mealIds: string[]): Promise<void> {
  if (!mealIds.length) return;
  const res = await fetch(`/api/reviews?ids=${encodeURIComponent(mealIds.join(","))}`, {
    credentials: "same-origin",
    headers: authHeaders(),
  });
  if (!res.ok) return;
  const { reviews } = (await res.json()) as { reviews: MealReview[] };
  const map: Record<string, MealReview | null> = {};
  for (const id of mealIds) map[id] = null;
  for (const r of reviews) map[r.mealId] = r;
  useHistory.getState().setReviews(map);
}
