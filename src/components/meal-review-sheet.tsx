"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { Star, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { getDish } from "@/data/dishes";
import { mealTitle } from "@/lib/meal-time";
import type { Meal, MealReview } from "@/lib/protocol";
import { deleteReview, ratingText, saveReview } from "@/lib/review-actions";
import { useCart } from "@/lib/store";
import { cn, haptic } from "@/lib/utils";
import { DishThumb } from "./dish-thumb";

/** 好评在前，下厨复盘在后 */
const POSITIVE_TAGS = ["全场最佳", "下饭神器", "汤汁拌饭", "火候刚好", "肉炖得烂", "清爽解腻"];
const REVIEW_TAGS = ["味道偏咸", "过于清淡", "稍微偏辣", "油有点大", "糖放多了"];

/** 按手指在星星区域里的横向位置换算成 1~5 星 */
function starAt(clientX: number, el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  return Math.min(5, Math.max(1, Math.ceil(((clientX - r.left) / r.width) * 5)));
}

/** 可点可滑的一排星星。data-vaul-no-drag：在星星上横滑不会被抽屉当成下拉关闭 */
function StarScrubber({
  value,
  onChange,
  size,
  gap,
}: {
  value: number;
  onChange: (v: number) => void;
  size: number;
  gap: string;
}) {
  const update = (x: number, el: HTMLElement) => {
    const v = starAt(x, el);
    if (v !== value) {
      haptic(4);
      onChange(v);
    }
  };
  return (
    <div
      data-vaul-no-drag
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) update(e.clientX, e.currentTarget);
      }}
      className={cn("flex cursor-pointer touch-none items-center select-none", gap)}
    >
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          weight={s <= value ? "fill" : "regular"}
          className={cn("pointer-events-none transition-colors", s <= value ? "text-accent" : "text-line-2")}
        />
      ))}
    </div>
  );
}

/**
 * 点评抽屉。抽屉本体一直挂着（关闭时才有退场动画），表单按 session 重建：
 * 每次打开都从当前点评重新初始化，删除 / 别处修改后再打开不会残留旧值。
 */
export function MealReviewSheet({
  meal,
  review,
  open,
  session,
  onClose,
}: {
  meal: Meal;
  review: MealReview | null;
  open: boolean;
  session: number;
  onClose: () => void;
}) {
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
        <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/35" />
        <Drawer.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] max-w-[520px] flex-col rounded-t-2xl border-t border-line bg-paper outline-none"
        >
          <div className="shrink-0 pt-3 pb-2">
            <div className="mx-auto h-1 w-10 rounded-full bg-line-2" />
          </div>
          <ReviewForm key={session} meal={meal} review={review} onDone={onClose} />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ReviewForm({
  meal,
  review,
  onDone,
}: {
  meal: Meal;
  review: MealReview | null;
  onDone: () => void;
}) {
  const today = useCart((s) => s.today);
  const [rating, setRating] = useState(review?.rating ?? 5);
  const [tags, setTags] = useState<string[]>(review?.tags ?? []);
  const [dishRatings, setDishRatings] = useState<Record<string, number>>(review?.dishRatings ?? {});
  const [comment, setComment] = useState(review?.comment ?? "");
  const [busy, setBusy] = useState(false);
  // 删除走抽屉内的二次确认：抽屉打开时外部的确认弹窗点不到
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleTag = (t: string) => {
    haptic(4);
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const submit = async () => {
    setBusy(true);
    try {
      await saveReview(meal.id, { rating, tags, dishRatings, comment });
      haptic(10);
      toast("评价已保存");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteReview(meal.id);
      haptic(10);
      toast("评价已删除");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const tagBtn = (t: string, muted: boolean) => {
    const on = tags.includes(t);
    return (
      <button
        key={t}
        type="button"
        onClick={() => toggleTag(t)}
        className={cn(
          "rounded-xl border py-2 text-[12px] font-medium transition active:scale-95",
          on ? "border-accent bg-accent text-white" : cn("border-line bg-card", muted ? "text-ink-3" : "text-ink-2"),
        )}
      >
        {t}
      </button>
    );
  };

  return (
    <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="flex items-baseline justify-between border-b border-line/60 pb-3">
        <Drawer.Title className="font-display text-[19px] tracking-wider text-ink">点评</Drawer.Title>
        <Drawer.Description className="text-[12px] text-ink-3 tabular-nums">
          {mealTitle(meal.mealDate, meal.slot, today)}
        </Drawer.Description>
      </div>

      {/* 总体评分 */}
      <div className="flex flex-col items-center py-5">
        <StarScrubber value={rating} onChange={setRating} size={34} gap="gap-3" />
        <p className="mt-2.5 font-display text-[16px] tracking-widest text-accent">{ratingText(rating)}</p>
      </div>

      {/* 菜品点评：文案在星星左侧，星星贴右 */}
      {meal.items.length > 0 && (
        <div>
          <p className="text-[12px] font-medium text-ink-3">菜品点评</p>
          <ul className="mt-2 divide-y divide-line/60 rounded-xl border border-line bg-card px-3">
            {meal.items.map((it) => {
              const dish = getDish(it.dishId);
              if (!dish) return null;
              const v = dishRatings[it.dishId] ?? 0;
              return (
                <li key={it.dishId} className="flex items-center gap-2 py-2.5">
                  <DishThumb dish={dish} className="size-8 shrink-0 rounded" sizes="32px" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{dish.name}</span>
                  <span className="w-10 shrink-0 text-right text-[11px] text-ink-2">{v ? ratingText(v) : ""}</span>
                  <StarScrubber
                    value={v}
                    onChange={(nv) => setDishRatings((p) => ({ ...p, [it.dishId]: nv }))}
                    size={18}
                    gap="gap-0.5"
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 评价标签 */}
      <div className="mt-5">
        <p className="text-[12px] font-medium text-ink-3">评价标签</p>
        <div className="mt-2 grid grid-cols-3 gap-2">{POSITIVE_TAGS.map((t) => tagBtn(t, false))}</div>
        <div className="mt-2 grid grid-cols-3 gap-2">{REVIEW_TAGS.map((t) => tagBtn(t, true))}</div>
      </div>

      {/* 文字点评 */}
      <div className="mt-5">
        <label htmlFor={`review-${meal.id}`} className="text-[12px] font-medium text-ink-3">
          文字点评
        </label>
        <textarea
          id={`review-${meal.id}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="来点评一下吧～"
          rows={3}
          maxLength={200}
          className="mt-1.5 w-full resize-none rounded-xl border border-line bg-card p-3 text-[13px] text-ink placeholder:text-ink-3/60 focus:border-accent focus:outline-none"
        />
      </div>

      {/* 底部操作 */}
      <div className="mt-5 flex items-center gap-2.5">
        {confirmDelete ? (
          <>
            <button
              key="cancel"
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="h-12 flex-1 rounded-full border border-line bg-card text-[15px] text-ink-2 transition active:scale-[0.99]"
            >
              取消
            </button>
            <button
              key="confirm"
              type="button"
              disabled={busy}
              onClick={remove}
              className="h-12 flex-1 rounded-full bg-chili text-[15px] font-medium text-white transition active:scale-[0.99] disabled:opacity-50"
            >
              {busy ? "正在删除…" : "确认删除"}
            </button>
          </>
        ) : (
          <>
            {review && (
              <button
                key="trash"
                type="button"
                aria-label="删除评价"
                onClick={() => {
                  haptic(6);
                  setConfirmDelete(true);
                }}
                className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-card text-chili transition active:scale-90"
              >
                <Trash size={18} />
              </button>
            )}
            <button
              key="save"
              type="button"
              disabled={busy}
              onClick={submit}
              className="h-12 flex-1 rounded-full bg-accent text-[15px] font-medium tracking-wide text-white transition active:scale-[0.99] disabled:opacity-40"
            >
              {busy ? "正在保存…" : "保存点评"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
