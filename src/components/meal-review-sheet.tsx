"use client";

import { useRef, useState } from "react";
import { Drawer } from "vaul";
import { Star } from "@phosphor-icons/react";
import { toast } from "sonner";
import { getDish } from "@/data/dishes";
import { authHeaders } from "@/lib/auth-store";
import { useHeatmap } from "@/lib/heatmap-store";
import { useHistory } from "@/lib/history-store";
import { mealTitle } from "@/lib/meal-time";
import type { Meal, MealReview } from "@/lib/protocol";
import { useCart } from "@/lib/store";
import { cn, haptic } from "@/lib/utils";
import { DishThumb } from "./dish-thumb";

/** 5 档评级定义 */
export const RATING_LEVELS: { rating: number; text: string }[] = [
  { rating: 5, text: "夯爆了" },
  { rating: 4, text: "顶级" },
  { rating: 3, text: "人上人" },
  { rating: 2, text: "NPC" },
  { rating: 1, text: "拉完了" },
];

/** 预设做菜复盘与评价标签（分层：好评赞美在前，烹饪备忘在后） */
const POSITIVE_TAGS = [
  "全场最佳",
  "下饭神器",
  "汤汁拌饭",
  "火候刚好",
  "肉炖得烂",
  "清爽解腻",
];

const REVIEW_TAGS = [
  "味道偏咸",
  "过于清淡",
  "稍微偏辣",
  "油有点大",
  "糖放多了",
];

export function MealReviewSheet({
  meal,
  open,
  onClose,
}: {
  meal: Meal | null;
  open: boolean;
  onClose: () => void;
}) {
  return <MealReviewSheetInner meal={meal} open={open} onClose={onClose} />;
}

function MealReviewSheetInner({
  meal,
  open,
  onClose,
}: {
  meal: Meal | null;
  open: boolean;
  onClose: () => void;
}) {
  const today = useCart((s) => s.today);
  const updateReview = useHistory((s) => s.updateReview);
  const fetchHeatmap = useHeatmap((s) => s.fetchHeatmap);

  const [activeMeal, setActiveMeal] = useState<Meal | null>(() => meal);
  if (meal && meal !== activeMeal) {
    setActiveMeal(meal);
  }
  const currentMeal = meal || activeMeal;

  const [rating, setRating] = useState<number>(() => currentMeal?.review?.rating || 5);
  const [tags, setTags] = useState<string[]>(() => currentMeal?.review?.tags || []);
  const [dishRatings, setDishRatings] = useState<Record<string, number>>(
    () => currentMeal?.review?.dishRatings || {},
  );
  const [comment, setComment] = useState(() => currentMeal?.review?.comment || "");
  const [submitting, setSubmitting] = useState(false);

  const starsContainerRef = useRef<HTMLDivElement>(null);
  const currentLevel = RATING_LEVELS.find((l) => l.rating === rating) ?? RATING_LEVELS[0];
  const title = currentMeal ? mealTitle(currentMeal.mealDate, currentMeal.slot, today) : "";

  // 总体评分滑动选择逻辑
  const handleStarScrub = (clientX: number) => {
    const container = starsContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, relativeX / rect.width));
    const nextRating = Math.max(1, Math.min(5, Math.ceil(ratio * 5)));
    if (nextRating !== rating) {
      haptic(4);
      setRating(nextRating);
    }
  };

  // 单道菜滑动/拖动选择星级
  const handleDishScrub = (dishId: string, clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, relativeX / rect.width));
    const nextVal = Math.max(1, Math.min(5, Math.ceil(ratio * 5)));
    if (dishRatings[dishId] !== nextVal) {
      haptic(4);
      setDishRatings((prev) => ({ ...prev, [dishId]: nextVal }));
    }
  };

  const toggleTag = (t: string) => {
    haptic(4);
    setTags((prev) => (prev.includes(t) ? prev.filter((item) => item !== t) : [...prev, t]));
  };

  const handleSubmit = async () => {
    if (!currentMeal) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mealId: currentMeal.id,
          rating,
          ratingText: currentLevel.text,
          tags,
          dishRatings,
          comment,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "保存失败");
      }

      const json = (await res.json()) as { ok: boolean; review: MealReview };
      updateReview(currentMeal.id, json.review);
      void fetchHeatmap(365, true);
      haptic(10);
      toast.success("评价已保存");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      repositionInputs={false}
      scrollLockTimeout={0}
      closeThreshold={0.2}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/35 transition-opacity" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[520px] rounded-t-3xl border-t border-line bg-paper outline-none focus:outline-none">
          {/* 拖动把手 */}
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line" />

          <div className="max-h-[85dvh] overflow-y-auto px-5 pt-3 pb-8">
            {/* 顶栏：左侧标题，右侧对称日期 */}
            <div className="flex items-baseline justify-between border-b border-line/60 pb-3">
              <h2 className="font-display text-[19px] tracking-wider text-ink">点评</h2>
              <span className="text-[12px] text-ink-3 tabular-nums">{title}</span>
            </div>

            {/* 总体评价：大厂标准无感化融合（去除“整体评分”生硬表单框） */}
            <div className="py-5 text-center">
              {/* 五星交互区：支持点击与拖拽划过，冷杉绿强调 */}
              <div
                ref={starsContainerRef}
                onPointerDown={(e) => {
                  handleStarScrub(e.clientX);
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.buttons > 0) handleStarScrub(e.clientX);
                }}
                className="flex items-center justify-center gap-3 cursor-pointer touch-none select-none py-1"
              >
                {[1, 2, 3, 4, 5].map((starVal) => {
                  const filled = starVal <= rating;
                  return (
                    <div
                      key={starVal}
                      className="p-1 transition active:scale-125 pointer-events-none"
                    >
                      <Star
                        size={34}
                        weight={filled ? "fill" : "regular"}
                        className={cn(
                          "transition-colors",
                          filled ? "text-accent" : "text-line-2",
                        )}
                      />
                    </div>
                  );
                })}
              </div>

              {/* 实时星级文案 */}
              <p className="mt-2 font-display text-[16px] tracking-widest text-accent">
                {currentLevel.text}
              </p>
            </div>

            {/* 菜品点评（紧接着总体评价，去掉选填，支持滑动划选） */}
            {currentMeal && currentMeal.items.length > 0 && (
              <div className="mt-2">
                <p className="text-[12px] font-medium text-ink-3">菜品点评</p>
                <ul className="mt-2 divide-y divide-line/60 rounded-xl border border-line bg-card/70 px-3">
                  {currentMeal.items.map((item) => {
                    const dish = getDish(item.dishId);
                    if (!dish) return null;
                    const val = dishRatings[item.dishId] || 0;
                    const dishLevel = RATING_LEVELS.find((l) => l.rating === val);

                    return (
                      <li key={item.dishId} className="flex items-center justify-between py-2.5">
                        {/* 左侧：菜品缩略图 + 菜名 */}
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <DishThumb dish={dish} className="size-8 shrink-0 rounded" sizes="32px" />
                          <span className="truncate text-[13px] text-ink">{dish.name}</span>
                        </div>

                        {/* 右侧：[描述文案] + [贴紧最右侧的 5 颗星，支持滑动控制] */}
                        <div className="flex items-center gap-2 shrink-0 select-none">
                          <span className="w-11 text-right text-[11px] font-medium text-ink-2">
                            {dishLevel ? dishLevel.text : ""}
                          </span>
                          <div
                            onPointerDown={(e) => {
                              handleDishScrub(item.dishId, e.clientX, e.currentTarget);
                              e.currentTarget.setPointerCapture?.(e.pointerId);
                            }}
                            onPointerMove={(e) => {
                              if (e.buttons > 0) {
                                handleDishScrub(item.dishId, e.clientX, e.currentTarget);
                              }
                            }}
                            className="flex items-center cursor-pointer touch-none p-1"
                          >
                            {[1, 2, 3, 4, 5].map((s) => {
                              const active = s <= val;
                              return (
                                <div
                                  key={s}
                                  className="p-0.5 text-line-2 transition pointer-events-none"
                                >
                                  <Star
                                    size={17}
                                    weight={active ? "fill" : "regular"}
                                    className={active ? "text-accent" : "text-line-2"}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* 评价标签（分层：正向体验在先，复盘备忘在后） */}
            <div className="mt-5">
              <p className="text-[12px] font-medium text-ink-3">评价标签</p>

              {/* 好评梯队 */}
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {POSITIVE_TAGS.map((t) => {
                  const selected = tags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className={cn(
                        "flex items-center justify-center rounded-xl py-2 text-[12px] font-medium transition active:scale-95 border",
                        selected
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-card text-ink-2 hover:bg-paper",
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              {/* 复盘备忘梯队 */}
              <div className="mt-2 grid grid-cols-3 gap-2">
                {REVIEW_TAGS.map((t) => {
                  const selected = tags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className={cn(
                        "flex items-center justify-center rounded-xl py-2 text-[12px] font-medium transition active:scale-95 border",
                        selected
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-card text-ink-3 hover:bg-paper",
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 文字点评输入框 */}
            <div className="mt-5">
              <label htmlFor="review-comment" className="text-[12px] font-medium text-ink-3">
                文字点评
              </label>
              <textarea
                id="review-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="来点评一下吧～"
                rows={3}
                maxLength={200}
                className="mt-1.5 w-full resize-none rounded-xl border border-line bg-card p-3 text-[13px] text-ink placeholder:text-ink-3/60 focus:border-accent focus:outline-none"
              />
            </div>

            {/* 保存按钮 */}
            <div className="mt-6">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex h-12 w-full items-center justify-center rounded-full bg-accent text-[15px] font-medium tracking-wide text-white transition active:scale-[0.99] disabled:opacity-40"
              >
                {submitting ? "正在保存..." : "保存点评"}
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
