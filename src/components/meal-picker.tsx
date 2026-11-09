"use client";

import { Check } from "@phosphor-icons/react";
import {
  dayLabel,
  isMealDate,
  mealKey,
  pickableDays,
  shortDate,
  SLOTS,
  type Slot,
} from "@/lib/meal-time";
import { cn, haptic } from "@/lib/utils";

export type MealPick = { date: string; slot: Slot };

/**
 * 「选择用餐时间」两列选择器（参考外卖 App 的送达时间）：
 * 左列日期，右列时段，一次点选完成。受控组件。
 * - 左列灰底，选中项与右列同色，视觉上连成一片。
 * - 右列只有选中行用强调色 + 对勾；该时段已有订单时在名字下写一行小字。
 * - taken：已有订单的 mealKey → 该订单的菜数。
 */
export function MealPicker({
  today,
  value,
  onChange,
  days,
  taken,
  minDate,
  disabled,
  className,
}: {
  today: string;
  value: MealPick;
  onChange: (v: MealPick) => void;
  /** 快捷日期，默认 今天~后天；其他日期通过原生日期选择器选择 */
  days?: string[];
  taken?: Map<string, number>;
  /** 普通用户不早于今天，管理员可补录过去的日期 */
  minDate?: string;
  disabled?: boolean;
  className?: string;
}) {
  const dayList = days ?? pickableDays(today);
  const custom = !dayList.includes(value.date);

  return (
    <div
      className={cn(
        "flex overflow-hidden rounded-card border border-line bg-card",
        className,
      )}
    >
      {/* 日期列 */}
      <div
        role="radiogroup"
        aria-label="日期"
        className="w-[104px] shrink-0 bg-paper-2"
      >
        {dayList.map((date) => {
          const on = date === value.date;
          return (
            <button
              key={date}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => {
                if (on) return;
                haptic(6);
                // 只换日期，已选的用餐保留
                onChange({ ...value, date });
              }}
              className={cn(
                "relative flex min-h-14 w-full flex-col justify-center px-4 text-left transition-colors",
                on ? "bg-card" : "active:bg-line/60",
              )}
            >
              {on && (
                <span
                  aria-hidden
                  className="absolute top-1/2 left-0 h-[18px] w-[3px] -translate-y-1/2 rounded-r-full bg-accent"
                />
              )}
              <span
                className={cn(
                  "text-[15px] leading-tight",
                  on ? "font-medium text-ink" : "text-ink-2",
                )}
              >
                {dayLabel(date, today) ?? shortDate(date)}
              </span>
              <span className="mt-0.5 text-[10.5px] leading-tight text-ink-3">
                {shortDate(date)}
              </span>
            </button>
          );
        })}
        <label
          className={cn(
            "relative flex min-h-14 w-full flex-col justify-center px-4 text-left transition-colors focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent",
            custom ? "bg-card" : "active:bg-line/60",
          )}
        >
          {custom && (
            <span
              aria-hidden
              className="absolute top-1/2 left-0 h-[18px] w-[3px] -translate-y-1/2 rounded-r-full bg-accent"
            />
          )}
          <span className={cn("text-[15px] leading-tight", custom ? "font-medium text-ink" : "text-ink-2")}>
            自定义
          </span>
          <span className="mt-0.5 text-[10.5px] leading-tight text-ink-3">
            {custom ? value.date.replaceAll("-", "/") : "选择日期"}
          </span>
          <input
            type="date"
            aria-label="自定义日期"
            value={value.date}
            min={minDate}
            max="9999-12-31"
            disabled={disabled}
            onChange={(e) => {
              const date = e.target.value;
              if (!isMealDate(date) || (minDate && date < minDate) || date === value.date) return;
              haptic(6);
              onChange({ ...value, date });
            }}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {
                /* iOS 等环境由原生点击打开 */
              }
            }}
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
          />
        </label>
      </div>

      {/* 时段列 */}
      <div role="radiogroup" aria-label="用餐" className="min-w-0 flex-1 bg-card">
        {SLOTS.map(({ id, name }) => {
          const on = id === value.slot;
          const exist = taken?.get(mealKey(value.date, id));
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => {
                if (on) return;
                haptic(6);
                onChange({ ...value, slot: id });
              }}
              className="flex min-h-12 w-full items-center gap-2 px-4 py-2 text-left transition-colors active:bg-paper"
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[15px] leading-tight transition-colors",
                    on ? "font-medium text-accent" : "text-ink",
                  )}
                >
                  {name}
                </span>
                {exist !== undefined && (
                  <span className="mt-0.5 block truncate text-[11px] leading-tight text-ink-3">
                    已有 {exist} 道菜，下单后合并
                  </span>
                )}
              </span>
              {on && <Check size={17} weight="bold" className="shrink-0 text-accent" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
