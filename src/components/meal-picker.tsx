"use client";

import {
  dayLabel,
  mealKey,
  pickableDays,
  shortDate,
  SLOTS,
  type Slot,
} from "@/lib/meal-time";
import { cn, haptic } from "@/lib/utils";

export type MealPick = { date: string; slot: Slot };

/**
 * 就餐日期 + 餐别的两行单选：第一行日期，第二行餐别。
 * 受控组件；taken 是已有订单的 mealKey 集合，当前所选日期下已有订单的餐别角上会有一个小圆点。
 */
export function MealPicker({
  today,
  value,
  onChange,
  days,
  taken,
  className,
}: {
  today: string;
  value: MealPick;
  onChange: (v: MealPick) => void;
  /** 可选日期，默认 今天~后天（pickableDays） */
  days?: string[];
  taken?: Set<string>;
  className?: string;
}) {
  const dayList = days ?? pickableDays(today);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div role="radiogroup" aria-label="日期" className="flex gap-2 overflow-x-auto">
        {dayList.map((date) => {
          const on = date === value.date;
          // 昨天是补录，用更淡的样式提示
          const past = date < today;
          return (
            <button
              key={date}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                if (on) return;
                haptic(6);
                onChange({ ...value, date });
              }}
              className={cn(
                "flex min-w-0 flex-1 shrink-0 basis-0 flex-col items-center rounded-full border px-2 py-1.5 leading-tight transition active:scale-95",
                on
                  ? past
                    ? "border-accent/60 bg-accent/70 text-white"
                    : "border-accent bg-accent text-white"
                  : past
                    ? "border-line bg-card text-ink-3"
                    : "border-line bg-card text-ink-2",
              )}
            >
              <span className="text-[13px] font-medium whitespace-nowrap">
                {dayLabel(date, today) ?? shortDate(date)}
              </span>
              <span
                className={cn(
                  "text-[10px] whitespace-nowrap",
                  on ? "text-white/75" : "text-ink-3",
                )}
              >
                {shortDate(date)}
              </span>
            </button>
          );
        })}
      </div>

      <div role="radiogroup" aria-label="用餐" className="grid grid-cols-4 gap-2">
        {SLOTS.map(({ id, name }) => {
          const on = id === value.slot;
          const has = taken?.has(mealKey(value.date, id));
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={has ? `${name}（已有一单）` : name}
              onClick={() => {
                if (on) return;
                haptic(6);
                onChange({ ...value, slot: id });
              }}
              className={cn(
                "relative rounded-full border py-2 text-[13px] font-medium transition active:scale-95",
                on
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-card text-ink-2",
              )}
            >
              {name}
              {has && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1.5 right-3 size-1.5 rounded-full",
                    on ? "bg-white" : "bg-caramel",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
