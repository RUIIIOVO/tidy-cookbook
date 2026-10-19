"use client";

import { useState, type ReactNode } from "react";
import { CaretDown, PencilSimple, Star, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { getDish } from "@/data/dishes";
import { useConfirm } from "@/lib/confirm-store";
import { useHistory } from "@/lib/history-store";
import { mealTitle } from "@/lib/meal-time";
import type { Meal } from "@/lib/protocol";
import { useCart } from "@/lib/store";
import { deleteReview } from "@/lib/review-actions";
import { useDishSheet } from "@/lib/ui-store";
import { cn, formatPersonName, haptic } from "@/lib/utils";
import { ui } from "@/lib/ui";
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
  againAction,
  footerAction,
  dishFocus,
  enableReview = false,
}: {
  meal: Meal;
  /** 点菜品打开详情时直接定位到哪一段（备菜页传 "ingredients"） */
  dishFocus?: "ingredients";
  /** 不传则不显示右上角编辑 / 删除图标 */
  onDelete?: () => Promise<boolean>;
  /** 「再点一次」独立动作，与点评按钮同级并排在右侧 */
  againAction?: ReactNode;
  /** 底部合计行右侧的动作（备用） */
  footerAction?: ReactNode;
  /** 是否开启点评功能（通常已吃订单开启） */
  enableReview?: boolean;
}) {
  const today = useCart((s) => s.today);
  const openSheet = useDishSheet((s) => s.open);
  const [open, setOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  // 每次打开点评都换一个 session，表单按当前点评重新初始化
  const [reviewSession, setReviewSession] = useState(0);
  const confirm = useConfirm((s) => s.confirm);
  // 本地覆盖（刚保存 / 删除、今天补拉的）优先，其次是订单自带的点评
  const override = useHistory((s) => s.reviews[meal.id]);
  const review = override !== undefined ? override : (meal.review ?? null);

  const openReview = () => {
    haptic(6);
    setReviewSession((n) => n + 1);
    setReviewOpen(true);
  };

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
              {/* 单菜星级（点评里给这道菜打过分才显示） */}
              {(review?.dishRatings?.[i.dishId] ?? 0) > 0 && (
                <span className="flex shrink-0 items-center" aria-label={`${review!.dishRatings[i.dishId]} 星`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      size={10}
                      weight={n <= review!.dishRatings[i.dishId] ? "fill" : "regular"}
                      className={n <= review!.dishRatings[i.dishId] ? "text-accent" : "text-line-2"}
                    />
                  ))}
                </span>
              )}
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

      {/* 小票合计行：遵循 ui.chip 视觉规范与对齐 */}
      <div className="mt-1 flex min-h-11 items-center justify-between border-t border-dashed border-line-2 pt-3">
        <span className="text-[11px] text-ink-3">
          合计 <span className="tabular-nums text-ink-2">{rows.length}</span> 道
        </span>

        {/* 右侧：未评价时「评价」+「再点一次」 */}
        <div className="flex items-center gap-2">
          {enableReview && !review && (
            <button type="button" onClick={openReview} className={cn(ui.chip, ui.chipOff)}>
              <Star size={13} />
              评价
            </button>
          )}
          {againAction}
          {footerAction}
        </div>
      </div>

      {/* 已评价：小票末尾一段，和小票同一张纸，用虚线隔开 */}
      {enableReview && review && (
        <section className="mt-3 border-t border-dashed border-line-2 pt-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={13}
                  weight={n <= review.rating ? "fill" : "regular"}
                  className={n <= review.rating ? "text-accent" : "text-line-2"}
                />
              ))}
            </span>
            <span className="font-display text-[13px] tracking-wide text-accent">{review.ratingText}</span>
            <span className="ml-auto -mr-2 flex items-center">
              <button
                type="button"
                aria-label="编辑评价"
                onClick={openReview}
                className="grid size-8 place-items-center rounded-full text-ink-3 transition active:scale-90 active:bg-paper-2"
              >
                <PencilSimple size={16} />
              </button>
              <button
                type="button"
                aria-label="删除评价"
                onClick={() =>
                  confirm({
                    title: "删除这条评价？",
                    desc: "删除后无法恢复",
                    confirmText: "删除",
                    onConfirm: () => {
                      deleteReview(meal.id).then(
                        () => toast("评价已删除"),
                        () => toast("删除失败，请稍后重试"),
                      );
                    },
                  })
                }
                className="grid size-8 place-items-center rounded-full text-ink-3 transition active:scale-90 active:bg-paper-2"
              >
                <Trash size={16} />
              </button>
            </span>
          </div>

          {review.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {review.tags.map((t) => (
                <span key={t} className="rounded-md bg-paper px-2 py-0.5 text-[11px] text-ink-2">
                  {t}
                </span>
              ))}
            </div>
          )}

          {review.comment && <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{review.comment}</p>}

          {/* 评价人：和菜品行的点菜人同一样式 */}
          {review.reviewedBy && (
            <p className="mt-2 flex items-center gap-1 text-[10px] text-ink-3">
              <Avatar name={formatPersonName(review.reviewedBy)} className="size-[12px] text-[7.5px]" />
              {formatPersonName(review.reviewedBy)} 评价
            </p>
          )}
        </section>
      )}

      {enableReview && (
        <MealReviewSheet
          meal={meal}
          review={review}
          open={reviewOpen}
          session={reviewSession}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </article>
  );
}
