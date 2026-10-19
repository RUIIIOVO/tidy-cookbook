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
export const RATING_LEVELS: { rating: number; text: string; color: string }[] = [
  { rating: 5, text: "夯爆了", color: "text-accent" },
  { rating: 4, text: "顶级", color: "text-accent" },
  { rating: 3, text: "人上人", color: "text-ink-2" },
  { rating: 2, text: "NPC", color: "text-ink-3" },
  { rating: 1, text: "拉完了", color: "text-chili" },
];

/** 预设做菜复盘与评价标签 */
const PRESET_TAGS = [
  "下饭神器",
  "全场最佳",
  "汤汁拌饭",
  "下次少盐",
  "稍微偏辣",
  "油有点大",
  "火候刚好",
  "肉炖得烂",
  "清爽解腻",
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
  if (!meal || !open) return null;
  return <MealReviewSheetInner meal={meal} open={open} onClose={onClose} />;
}

function MealReviewSheetInner({
  meal,
  open,
  onClose,
}: {
  meal: Meal;
  open: boolean;
  onClose: () => void;
}) {
  const today = useCart((s) => s.today);
  const updateReview = useHistory((s) => s.updateReview);
  const fetchHeatmap = useHeatmap((s) => s.fetchHeatmap);

  const [rating, setRating] = useState<number>(() => meal.review?.rating || 5);
  const [tags, setTags] = useState<string[]>(() => meal.review?.tags || []);
  const [dishRatings, setDishRatings] = useState<Record<string, number>>(
    () => meal.review?.dishRatings || {},
  );
  const [comment, setComment] = useState(() => meal.review?.comment || "");
  const [submitting, setSubmitting] = useState(false);

  const starsContainerRef = useRef<HTMLDivElement>(null);
  const currentLevel = RATING_LEVELS.find((l) => l.rating === rating) ?? RATING_LEVELS[0];
  const title = mealTitle(meal.mealDate, meal.slot, today);

  // 滑动选择星星逻辑（支持 touch 与 pointer 连续划选）
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

  const toggleTag = (t: string) => {
    haptic(4);
    setTags((prev) => (prev.includes(t) ? prev.filter((item) => item !== t) : [...prev, t]));
  };

  const handleDishRating = (dishId: string, val: number) => {
    haptic(4);
    setDishRatings((prev) => ({
      ...prev,
      [dishId]: prev[dishId] === val ? 0 : val, // 点击同星取消单菜单独打分
    }));
  };

  const handleSubmit = async () => {
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
          mealId: meal.id,
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
      updateReview(meal.id, json.review);
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
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[520px] rounded-t-3xl border-t border-line bg-paper outline-none focus:outline-none">
          {/* 拖动把手，右上角无冗余关闭按钮 */}
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line" />

          <div className="max-h-[85dvh] overflow-y-auto px-5 pt-3 pb-8">
            {/* 顶栏：沉浸式标题 */}
            <div className="text-center">
              <h2 className="font-display text-[18px] tracking-wide text-ink">点评</h2>
              <p className="mt-0.5 text-[11px] text-ink-3">{title}</p>
            </div>

            {/* 整体打分：支持连续滑动打分 */}
            <div className="mt-5 rounded-card border border-line bg-card/70 p-4 text-center">
              <span className="text-[11px] text-ink-3">整体评分</span>
              {/* 五星交互区：支持点击与拖拽划过，采用主题色 accent */}
              <div
                ref={starsContainerRef}
                onPointerDown={(e) => {
                  handleStarScrub(e.clientX);
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.buttons > 0) handleStarScrub(e.clientX);
                }}
                className="mt-3 flex items-center justify-center gap-2.5 cursor-pointer touch-none select-none py-1"
              >
                {[1, 2, 3, 4, 5].map((starVal) => {
                  const filled = starVal <= rating;
                  return (
                    <div
                      key={starVal}
                      className="p-1 transition active:scale-125 pointer-events-none"
                    >
                      <Star
                        size={32}
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

              {/* 评级档位轻提示 */}
              <div className="mt-1 flex items-center justify-center">
                <span className={cn("text-[13px] font-medium tracking-wide", currentLevel.color)}>
                  {currentLevel.text}
                </span>
              </div>
            </div>

            {/* 标签选项：3 列等宽自适应网格，完美适配各种机型宽度，右边不留白 */}
            <div className="mt-4">
              <span className="text-[11px] text-ink-3">评价标签</span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {PRESET_TAGS.map((t) => {
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
            </div>

            {/* 菜品单独打分 */}
            {meal.items.length > 0 && (
              <div className="mt-4">
                <span className="text-[11px] text-ink-3">单菜评分（选填）</span>
                <ul className="mt-2 divide-y divide-line/60 rounded-card border border-line bg-card/70 px-3">
                  {meal.items.map((item) => {
                    const dish = getDish(item.dishId);
                    if (!dish) return null;
                    const val = dishRatings[item.dishId] || 0;
                    const dishLevel = RATING_LEVELS.find((l) => l.rating === val);

                    return (
                      <li key={item.dishId} className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <DishThumb dish={dish} className="size-8 shrink-0 rounded" sizes="32px" />
                          <span className="truncate text-[13px] text-ink">{dish.name}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {[1, 2, 3, 4, 5].map((s) => {
                            const active = s <= val;
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => handleDishRating(item.dishId, s)}
                                className="p-0.5 text-line-2 transition hover:text-accent active:scale-125"
                              >
                                <Star
                                  size={17}
                                  weight={active ? "fill" : "regular"}
                                  className={active ? "text-accent" : "text-line-2"}
                                />
                              </button>
                            );
                          })}
                          <span className="ml-1 w-11 text-right text-[10.5px] text-ink-3">
                            {dishLevel ? dishLevel.text : ""}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* 点评输入框 */}
            <div className="mt-4">
              <label htmlFor="review-comment" className="text-[11px] text-ink-3">
                点评
              </label>
              <textarea
                id="review-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="来点评一下吧～"
                rows={3}
                maxLength={200}
                className="mt-1.5 w-full resize-none rounded-card border border-line bg-card p-3 text-[13px] text-ink placeholder:text-ink-3/60 focus:border-accent focus:outline-none"
              />
            </div>

            {/* 保存按钮 */}
            <div className="mt-5">
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
