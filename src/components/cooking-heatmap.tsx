"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react";
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

        // 以每列中部的日期确定月份标签位置（更精准对齐）
        if (d === 0) {
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
    <div className="rounded-card border border-line bg-card p-3.5 shadow-2xs">
      {/* 标题与统计 */}
      <div className="flex items-center justify-between pb-2 text-[11px] text-ink-3">
        <Link
          href="/history/heatmap"
          onClick={() => haptic(4)}
          className="group flex items-center gap-1 font-display tracking-wider text-ink transition hover:text-accent"
        >
          <span>下厨记录</span>
          <CaretRight size={11} className="text-ink-3 group-hover:text-accent transition-colors" />
        </Link>
        <div className="flex items-center gap-1.5 tabular-nums">
          <span>近 90 天做饭 <strong className="font-medium text-ink">{totalCookDays}</strong> 天</span>
          <span>·</span>
          <span>共 <strong className="font-medium text-ink">{totalMeals}</strong> 餐</span>
        </div>
      </div>

      {/* GitHub 风格热力矩阵容器（支持超出微横滑） */}
      <div className="overflow-x-auto pt-1 pb-1">
        <div className="min-w-fit">
          {/* 月份表头：严格按每列的绝对像素距离计算，彻底解决响应式错位 */}
          <div className="relative mb-1 flex h-3.5 text-[9px] text-ink-3">
            <div className="w-[18px] shrink-0" />
            <div className="relative flex-1">
              {monthLabels.map((m) => (
                <span
                  key={`${m.label}-${m.weekIdx}`}
                  className="absolute tracking-tight"
                  style={{ left: `${m.weekIdx * 15.5}px` }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-1.5">
            {/* 左侧星期指示 */}
            <div className="flex flex-col justify-between py-[1px] pr-0.5 text-[8.5px] text-ink-3/70 select-none">
              <span>一</span>
              <span>三</span>
              <span>五</span>
              <span>日</span>
            </div>

            {/* 13 列方块 */}
            <div className="flex gap-[4px]">
              {weeks.map((w) => (
                <div key={w.weekIdx} className="flex flex-col gap-[4px]">
                  {w.days.map((d) => {
                    if (d.inFuture) {
                      return (
                        <div
                          key={d.date}
                          className="size-[11.5px] rounded-[2px] bg-line/20"
                        />
                      );
                    }

                    let cellBg = "bg-[#ebe4d5] hover:bg-line-2 transition-colors";
                    if (d.count === 1) cellBg = "bg-[#a3c4b2] hover:bg-[#92b8a2]";
                    else if (d.count === 2) cellBg = "bg-[#5d9476] hover:bg-[#508569]";
                    else if (d.count >= 3) cellBg = "bg-[#2e6349] hover:bg-[#25523c]";

                    return (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => {
                          haptic(6);
                          onSelectDate(d.date);
                        }}
                        title={`${d.date}：${d.count > 0 ? `${d.count} 餐 (${d.dishes} 道菜)` : "未开火"}`}
                        className={cn(
                          "size-[11.5px] rounded-[2px] transition active:scale-125 focus:outline-none",
                          cellBg,
                        )}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* 底部图例与查看详情入口 */}
          <div className="mt-2.5 flex items-center justify-between text-[9px] text-ink-3">
            <Link
              href="/history/heatmap"
              onClick={() => haptic(4)}
              className="flex items-center gap-0.5 text-accent hover:underline"
            >
              <span>查看年度与月份详情</span>
              <CaretRight size={9} />
            </Link>

            <div className="flex items-center gap-1">
              <span>少</span>
              <div className="size-[8px] rounded-[2px] bg-[#ebe4d5]" />
              <div className="size-[8px] rounded-[2px] bg-[#a3c4b2]" />
              <div className="size-[8px] rounded-[2px] bg-[#5d9476]" />
              <div className="size-[8px] rounded-[2px] bg-[#2e6349]" />
              <span>多</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
