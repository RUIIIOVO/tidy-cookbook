"use client";

import { CaretRight } from "@phosphor-icons/react";
import {
  addDays,
  dayLabel,
  isMealDate,
  mealKey,
  SLOTS,
  weekdayOf,
  type Slot,
} from "@/lib/meal-time";
import { ui } from "@/lib/ui";
import { cn, haptic } from "@/lib/utils";

export type MealTime = { date: string; slot: Slot };

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

/** owner 补录的最早日期（只是给原生选择器一个下限） */
const OWNER_MIN = "2020-01-01";
/** 最远能订到今天之后多少天，服务端规则一致 */
export const MAX_AHEAD_DAYS = 30;

/** '10月17日 周六'；是昨天 / 今天 / 明天 / 后天时前面加叫法：'明天 · 10月17日 周六' */
export function fullDate(date: string, today: string): string {
  const [, m, d] = date.split("-").map(Number);
  const base = `${m}月${d}日 周${WEEK[weekdayOf(date)]}`;
  const label = dayLabel(date, today);
  return label ? `${label} · ${base}` : base;
}

/** 行左侧的标签；和原单不一致时前面亮一个焦糖色小圆点 */
function RowLabel({ changed, children }: { changed: boolean; children: React.ReactNode }) {
  return (
    <span className="relative w-9 shrink-0 text-[13px] text-ink-2">
      {changed && (
        <span
          aria-label="已修改"
          className="absolute top-1/2 -left-2.5 size-1.5 -translate-y-1/2 rounded-full bg-caramel"
        />
      )}
      {children}
    </span>
  );
}

/**
 * 设置页式的两行分组：日期（点整行唤起系统日期选择器）+ 用餐（四个分段按钮）。
 * - base：订单原来的日期和餐次，用来判断哪一行改过。
 * - taken：已有订单的 mealKey 集合，所选日期下已有订单的那一顿，按钮角上有个小圆点。
 */
export function MealTimeFields({
  today,
  isOwner,
  value,
  base,
  taken,
  onChange,
  disabled,
}: {
  today: string;
  /** owner 才能选过去的日期 */
  isOwner: boolean;
  value: MealTime;
  base: MealTime;
  taken: Set<string>;
  onChange: (v: MealTime) => void;
  disabled?: boolean;
}) {
  const min = isOwner ? OWNER_MIN : today;
  const max = addDays(today, MAX_AHEAD_DAYS);

  return (
    <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-card">
      {/* 日期：透明的 <input type="date"> 铺满整行，iOS Safari 点哪里都会弹出系统选择器 */}
      <div className="relative flex items-center gap-3 px-3.5 py-3 transition active:bg-paper">
        <RowLabel changed={value.date !== base.date}>日期</RowLabel>
        <span className="min-w-0 flex-1 truncate text-right font-display text-[15px] tracking-wide text-ink">
          {fullDate(value.date, today)}
        </span>
        <CaretRight size={13} className="shrink-0 text-ink-3" />
        <input
          type="date"
          aria-label="日期"
          value={value.date}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            // 清空或超出范围（桌面浏览器可以手输）一律忽略
            if (!isMealDate(v) || v < min || v > max || v === value.date) return;
            haptic(6);
            onChange({ ...value, date: v });
          }}
          onClick={(e) => {
            // 桌面 Chrome 只有点日历图标才弹，这里统一主动唤起；不支持的环境静默忽略
            try {
              e.currentTarget.showPicker?.();
            } catch {
              /* 忽略 */
            }
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
        />
      </div>

      {/* 用餐：四个分段按钮常驻 */}
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <RowLabel changed={value.slot !== base.slot}>用餐</RowLabel>
        <div role="radiogroup" aria-label="用餐" className="grid min-w-0 flex-1 grid-cols-4 gap-1.5">
          {SLOTS.map(({ id, name }) => {
            const on = id === value.slot;
            const has = taken.has(mealKey(value.date, id));
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={has ? `${name}，已有订单` : name}
                disabled={disabled}
                onClick={() => {
                  if (on) return;
                  haptic(6);
                  onChange({ ...value, slot: id });
                }}
                className={cn(
                  ui.chip,
                  "relative px-0",
                  on ? ui.chipOn : ui.chipOff,
                )}
              >
                {name}
                {has && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-1 right-2 size-1.5 rounded-full",
                      on ? "bg-white" : "bg-caramel",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
