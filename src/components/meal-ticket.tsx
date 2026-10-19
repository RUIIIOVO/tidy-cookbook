"use client";

import { useState, type ReactNode } from "react";
import { CaretDown, ChatCircleDots, Star } from "@phosphor-icons/react";
import { getDish } from "@/data/dishes";
import { mealTitle } from "@/lib/meal-time";
import type { Meal } from "@/lib/protocol";
import { useCart } from "@/lib/store";
import { useDishSheet } from "@/lib/ui-store";
import { cn, formatPersonName, haptic } from "@/lib/utils";
import { Avatar } from "./avatar";
import { DishThumb } from "./dish-thumb";
import { MealCardActions } from "./meal-card-actions";
import { MealReviewSheet } from "./meal-review-sheet";

/** 超过这个数就折叠其余菜品 */
const FOLD_AT = 3;

/** 下单时间 HH:mm */
function formatTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 订单小票：订单页和备菜页共用的一餐一张卡。
 * 抬头（餐名 + 谁几点下单）、虚线、菜品明细（缩略图 + 点菜人头像）、折叠、底部合计。
 * 差异由 props 控制：onDelete 传了就在右上角显示编辑 / 删除；footerAction 放合计行右侧。
 */
export function MealTicket({
  meal,
  onDelete,
  footerAction,
  dishFocus,
  enableReview = false,
}: {
  meal: Meal;
  /** 点菜品打开详情时直接定位到哪一段（备菜页传 "ingredients"） */
  dishFocus?: "ingredients";
  /** 不传则不显示右上角编辑 / 删除图标 */
  onDelete?: () => Promise<boolean>;
  /** 底部合计行右侧的动作（如「再点一次」） */
  footerAction?: ReactNode;
  /** 是否开启点评功能（通常已吃订单开启） */
  enableReview?: boolean;
}) {
  const today = useCart((s) => s.today);
  const openSheet = useDishSheet((s) => s.open);
  const [open, setOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const rows = meal.items
    .map((i) => ({ i, dish: getDish(i.dishId) }))
    .filter((r): r is { i: typeof r.i; dish: NonNullable<typeof r.dish> } => !!r.dish);

  const people = [
    ...new Set(
      meal.items
        .map((i) => (i.addedBy ? formatPersonName(i.addedBy) : null))
        .filter((n): n is string => !!n),
    ),
  ];
  const shown = open ? rows : rows.slice(0, FOLD_AT);
  const hidden = rows.length - FOLD_AT;
  const time = formatTime(meal.orderedAt);
  const title = mealTitle(meal.mealDate, meal.slot, today);

  return (
    <article className="rounded-card border border-line bg-card px-4 pt-4 pb-3 shadow-2xs">
      {/* 小票抬头 */}
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[17px] tracking-wider text-ink">{title}</p>
          <p className="mt-1 truncate text-[10.5px] text-ink-3">
            {meal.orderedBy
              ? `${formatPersonName(meal.orderedBy)} 下单`
              : people.length > 0
                ? `${people.join("、")} 下单`
                : "已归档"}
            <span className="ml-1.5 tabular-nums">{time}</span>
          </p>
        </div>
        {onDelete && (
          <span className="-mt-1.5">
            <MealCardActions meal={meal} title={title} onDelete={onDelete} />
          </span>
        )}
      </header>

      <div className="mt-3 border-t border-dashed border-line-2" />

      {/* 明细：一行一道菜 */}
      <ul>
        {shown.map(({ i, dish }) => (
          <li key={i.dishId}>
            <button
              type="button"
              onClick={() => openSheet(dish.id, dishFocus ? { focus: dishFocus } : undefined)}
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
              {/* 只有 2 份及以上才写份数，1 份不写 */}
              {i.qty > 1 && (
                <span className="shrink-0 text-[12px] text-ink-2 tabular-nums">×{i.qty}</span>
              )}
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

      {/* 点评展示区（若已有点评） */}
      {meal.review && (
        <button
          type="button"
          onClick={() => {
            haptic(6);
            setReviewOpen(true);
          }}
          className="mt-2.5 flex w-full flex-col gap-1 rounded-lg border border-line bg-paper/70 p-2.5 text-left transition hover:bg-paper active:opacity-75"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="flex text-caramel">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={11}
                    weight={s <= (meal.review?.rating || 0) ? "fill" : "regular"}
                    className={s <= (meal.review?.rating || 0) ? "text-caramel" : "text-line-2"}
                  />
                ))}
              </span>
              <span className="text-[11px] font-medium text-ink-2">
                {meal.review.ratingText}
              </span>
            </div>
            {meal.review.reviewedBy && (
              <span className="text-[10px] text-ink-3">
                {formatPersonName(meal.review.reviewedBy)}
              </span>
            )}
          </div>

          {meal.review.tags && meal.review.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {meal.review.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-line-2/70 px-1.5 py-0.5 text-[9.5px] text-ink-3"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {meal.review.comment && (
            <p className="line-clamp-2 text-[11.5px] text-ink-2">“{meal.review.comment}”</p>
          )}
        </button>
      )}

      {/* 小票合计 */}
      <div className="mt-1 flex min-h-11 items-center justify-between border-t border-dashed border-line-2 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-3">
            合计 <span className="tabular-nums text-ink-2">{rows.length}</span> 道
          </span>
          {enableReview && !meal.review && (
            <button
              type="button"
              onClick={() => {
                haptic(6);
                setReviewOpen(true);
              }}
              className="flex items-center gap-1 rounded-md border border-line bg-card px-2 py-0.5 text-[11px] text-ink-2 transition hover:bg-paper active:scale-95"
            >
              <ChatCircleDots size={12} className="text-ink-3" />
              <span>点评</span>
            </button>
          )}
        </div>
        {footerAction}
      </div>

      <MealReviewSheet
        meal={meal}
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
      />
    </article>
  );
}
