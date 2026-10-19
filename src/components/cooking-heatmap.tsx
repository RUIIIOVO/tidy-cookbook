"use client";

import { useMemo } from "react";
import { useHeatmap } from "@/lib/heatmap-store";
import { addDays } from "@/lib/meal-time";
import { useCart } from "@/lib/store";
import { cn, haptic } from "@/lib/utils";

const WEEKS_COUNT = 13; // 近 13 周 (约 91 天)
const DAYS_PER_WEEK = 7;

export function CookingHeatmap({ onSelectDate }: { onSelectDate: (date: string) => void }) {
  const today = useCart((s) => s.today);
  const data = useHeatmap((s) => s.data);

  /**
   * 构建 13 列 × 7 行的日历矩阵（类似 GitHub Contribution）
   * 列从左向右（最早周到当前周），每列从上到下为 周一 到 周日 (0 到 6)
   */
  const { weeks, monthLabels, totalCookDays, totalMeals } = useMemo(() => {
    if (!today) return { weeks: [], monthLabels: [], totalCookDays: 0, totalMeals: 0 };

    // 计算 today 所在的星期几 (0: 周日, 1: 周一, ... 6: 周六)
    // 转换为周一为起始 (0: 周一, 6: 周日)
    const todayDate = new Date(`${today}T00:00:00+08:00`);
    const dayOfWeek = (todayDate.getDay() + 6) % 7; // 周一为 0

    // 计算整个日历网格的结束日期（当前周的周日）
    const daysToSunday = 6 - dayOfWeek;
    const endDate = addDays(today, daysToSunday);

    // 起始日期：从结束日期往前推 (13 * 7 - 1) 天
    const totalDays = WEEKS_COUNT * DAYS_PER_WEEK;
    const startDate = addDays(endDate, -(totalDays - 1));

    const weeksList: {
      weekIdx: number;
      days: { date: string; inFuture: boolean; count: number; dishes: number; hasReview: boolean }[];
    }[] = [];

    const months: { label: string; weekIdx: number }[] = [];
    let lastMonth = "";

    let cookDays = 0;
    let meals = 0;

    for (let w = 0; w < WEEKS_COUNT; w++) {
      const daysInWeek: (typeof weeksList)[0]["days"] = [];
      for (let d = 0; d < DAYS_PER_WEEK; d++) {
        const offset = w * 7 + d;
        const curDateStr = addDays(startDate, offset);
        const inFuture = curDateStr > today;

        const stat = data[curDateStr];
        const count = stat?.mealCount ?? 0;
        const dishes = stat?.dishCount ?? 0;
        const hasReview = Boolean(stat?.hasReview);

        if (!inFuture && count > 0) {
          cookDays += 1;
          meals += count;
        }

        // 识别月份起始标签（取每列周三对应的月份）
        if (d === 2) {
          const m = curDateStr.slice(5, 7);
          const monthText = `${parseInt(m, 10)}月`;
          if (monthText !== lastMonth) {
            months.push({ label: monthText, weekIdx: w });
            lastMonth = monthText;
          }
        }

        daysInWeek.push({
          date: curDateStr,
          inFuture,
          count,
          dishes,
          hasReview,
        });
      }
      weeksList.push({ weekIdx: w, days: daysInWeek });
    }

    return {
      weeks: weeksList,
      monthLabels: months,
      totalCookDays: cookDays,
      totalMeals: meals,
    };
  }, [today, data]);

  return (
    <div className="rounded-card border border-line bg-card/80 p-3.5 shadow-2xs">
      {/* 标题与统计 */}
      <div className="flex items-center justify-between pb-2 text-[11px] text-ink-3">
        <span className="font-display tracking-wider text-ink">开火历程</span>
        <div className="flex items-center gap-2">
          <span>近 90 天开火 <strong className="font-medium text-ink tabular-nums">{totalCookDays}</strong> 天</span>
          <span>·</span>
          <span>共 <strong className="font-medium text-ink tabular-nums">{totalMeals}</strong> 餐</span>
        </div>
      </div>

      {/* GitHub 风格热力矩阵容器（支持超出微横滑） */}
      <div className="overflow-x-auto pt-1 pb-1">
        <div className="min-w-fit">
          {/* 月份表头 */}
          <div className="relative mb-1 flex h-4 text-[9px] text-ink-3">
            <div className="w-4 shrink-0" /> {/* 对应星期左侧的留白 */}
            <div className="relative flex-1">
              {monthLabels.map((m) => (
                <span
                  key={`${m.label}-${m.weekIdx}`}
                  className="absolute tracking-tight"
                  style={{ left: `${(m.weekIdx / WEEKS_COUNT) * 100}%` }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-1">
            {/* 左侧星期指示 */}
            <div className="flex flex-col justify-between py-[1px] pr-1 text-[9px] text-ink-3/70 select-none">
              <span>一</span>
              <span>三</span>
              <span>五</span>
              <span>日</span>
            </div>

            {/* 13 列方块 */}
            <div className="flex gap-[3.5px]">
              {weeks.map((w) => (
                <div key={w.weekIdx} className="flex flex-col gap-[3.5px]">
                  {w.days.map((d) => {
                    if (d.inFuture) {
                      return (
                        <div
                          key={d.date}
                          className="size-[11.5px] rounded-[2px] bg-line/30"
                        />
                      );
                    }

                    // 色阶分类：0 餐 / 1 餐 / 2 餐 / >=3 餐
                    let cellBg = "bg-line-2 hover:bg-line transition-colors";
                    if (d.count === 1) cellBg = "bg-accent/35 hover:bg-accent/45";
                    else if (d.count === 2) cellBg = "bg-accent/70 hover:bg-accent/80";
                    else if (d.count >= 3) cellBg = "bg-accent hover:brightness-110";

                    return (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => {
                          haptic(6);
                          onSelectDate(d.date);
                        }}
                        title={`${d.date}：${d.count > 0 ? `${d.count} 餐 (${d.dishes} 道菜)` : "未开火"}${d.hasReview ? " · 有点评" : ""}`}
                        className={cn(
                          "relative size-[11.5px] rounded-[2px] transition active:scale-125 focus:outline-none",
                          cellBg,
                        )}
                      >
                        {d.hasReview && (
                          <span className="absolute -top-[1px] -right-[1px] size-[3px] rounded-full bg-caramel ring-1 ring-card" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* 底部图例 */}
          <div className="mt-2.5 flex items-center justify-end gap-1.5 text-[9px] text-ink-3">
            <span>少</span>
            <div className="size-[8.5px] rounded-[2px] bg-line-2" />
            <div className="size-[8.5px] rounded-[2px] bg-accent/35" />
            <div className="size-[8.5px] rounded-[2px] bg-accent/70" />
            <div className="size-[8.5px] rounded-[2px] bg-accent" />
            <span>多</span>
          </div>
        </div>
      </div>
    </div>
  );
}
