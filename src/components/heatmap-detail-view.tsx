"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useHeatmap } from "@/lib/heatmap-store";
import { useCart } from "@/lib/store";
import { cn, haptic } from "@/lib/utils";

const DAYS_OF_WEEK = ["一", "二", "三", "四", "五", "六", "日"];

export function HeatmapDetailView() {
  const today = useCart((s) => s.today) || new Date().toISOString().slice(0, 10);
  const data = useHeatmap((s) => s.data);

  // 模式：按月 (month) 或 按年 (year)
  const [mode, setMode] = useState<"month" | "year">("month");

  // 选中的年份与月份
  const [selectedYear, setSelectedYear] = useState(() => parseInt(today.slice(0, 4), 10));
  const [selectedMonth, setSelectedMonth] = useState(() => parseInt(today.slice(5, 7), 10));

  // 切换前一个月/后一个月
  const handlePrevMonth = () => {
    haptic(4);
    if (selectedMonth === 1) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    haptic(4);
    if (selectedMonth === 12) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  // 切换年份
  const handlePrevYear = () => {
    haptic(4);
    setSelectedYear((y) => y - 1);
  };
  const handleNextYear = () => {
    haptic(4);
    setSelectedYear((y) => y + 1);
  };

  // ── 月视图数据计算（标准月历大方格） ─────────────────────────
  const monthCalendarData = useMemo(() => {
    const year = selectedYear;
    const month = selectedMonth;

    // 当月第一天与最后一天
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const totalDays = lastDay.getDate();

    // 当月 1 号是周几（0: 周日, 1: 周一, ... 6: 周六）
    // 转换为周一为 0 (0: 周一, 6: 周日)
    const startWeekday = (firstDay.getDay() + 6) % 7;

    const cells: {
      dayNum: number;
      dateStr: string;
      isCurrentMonth: boolean;
      mealCount: number;
      dishCount: number;
      hasReview: boolean;
    }[] = [];

    // 填充前面补齐的上月空白
    for (let i = 0; i < startWeekday; i++) {
      cells.push({
        dayNum: 0,
        dateStr: "",
        isCurrentMonth: false,
        mealCount: 0,
        dishCount: 0,
        hasReview: false,
      });
    }

    let cookDays = 0;
    let meals = 0;

    // 填充当月
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const stat = data[dateStr];
      const count = stat?.mealCount ?? 0;
      const dishes = stat?.dishCount ?? 0;
      const hasReview = Boolean(stat?.hasReview);

      if (count > 0 && dateStr <= today) {
        cookDays += 1;
        meals += count;
      }

      cells.push({
        dayNum: d,
        dateStr,
        isCurrentMonth: true,
        mealCount: count,
        dishCount: dishes,
        hasReview,
      });
    }

    return {
      cells,
      cookDays,
      meals,
      totalDays,
    };
  }, [selectedYear, selectedMonth, data, today]);

  // ── 年视图数据计算（12 个精美迷你热力图月份阵列） ─────────────
  const yearCalendarData = useMemo(() => {
    const year = selectedYear;
    const monthsData = [];

    let yearCookDays = 0;
    let yearMeals = 0;

    for (let m = 1; m <= 12; m++) {
      const firstDay = new Date(year, m - 1, 1);
      const lastDay = new Date(year, m, 0);
      const totalDays = lastDay.getDate();
      const startWeekday = (firstDay.getDay() + 6) % 7;

      const days = [];
      let mCookDays = 0;
      let mMeals = 0;

      for (let i = 0; i < startWeekday; i++) {
        days.push({ dayNum: 0, dateStr: "", count: 0, hasReview: false });
      }

      for (let d = 1; d <= totalDays; d++) {
        const dateStr = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const stat = data[dateStr];
        const count = stat?.mealCount ?? 0;
        const hasReview = Boolean(stat?.hasReview);

        if (count > 0 && dateStr <= today) {
          mCookDays += 1;
          mMeals += count;
        }

        days.push({
          dayNum: d,
          dateStr,
          count,
          hasReview,
        });
      }

      yearCookDays += mCookDays;
      yearMeals += mMeals;

      monthsData.push({
        month: m,
        days,
        cookDays: mCookDays,
        meals: mMeals,
      });
    }

    return {
      months: monthsData,
      cookDays: yearCookDays,
      meals: yearMeals,
    };
  }, [selectedYear, data, today]);

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] flex-col bg-paper px-4 pt-4 pb-12 select-none">
      {/* 顶栏导航 */}
      <header className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Link
            href="/history/"
            onClick={() => haptic(4)}
            className="flex size-8 items-center justify-center rounded-full bg-line-2 text-ink transition active:scale-90"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="font-display text-[20px] tracking-wider text-ink">下厨详情</h1>
        </div>

        {/* 月 / 年 维度切换 */}
        <div className="flex rounded-lg border border-line bg-card p-0.5 text-[11.5px]">
          <button
            type="button"
            onClick={() => {
              haptic(4);
              setMode("month");
            }}
            className={cn(
              "rounded-md px-3 py-1 font-medium transition",
              mode === "month" ? "bg-accent text-white" : "text-ink-3 hover:text-ink",
            )}
          >
            按月
          </button>
          <button
            type="button"
            onClick={() => {
              haptic(4);
              setMode("year");
            }}
            className={cn(
              "rounded-md px-3 py-1 font-medium transition",
              mode === "year" ? "bg-accent text-white" : "text-ink-3 hover:text-ink",
            )}
          >
            按年
          </button>
        </div>
      </header>

      {/* 控制条：时间前进后退与统计 */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={mode === "month" ? handlePrevMonth : handlePrevYear}
            className="flex size-7 items-center justify-center rounded-md bg-paper text-ink transition active:scale-90"
          >
            <CaretLeft size={14} />
          </button>

          <span className="font-display text-[15px] tracking-wide text-ink tabular-nums">
            {mode === "month" ? `${selectedYear} 年 ${selectedMonth} 月` : `${selectedYear} 年`}
          </span>

          <button
            type="button"
            onClick={mode === "month" ? handleNextMonth : handleNextYear}
            className="flex size-7 items-center justify-center rounded-md bg-paper text-ink transition active:scale-90"
          >
            <CaretRight size={14} />
          </button>
        </div>

        {/* 统计指标 */}
        <div className="text-[11.5px] text-ink-3 tabular-nums">
          下厨{" "}
          <strong className="font-medium text-ink">
            {mode === "month" ? monthCalendarData.cookDays : yearCalendarData.cookDays}
          </strong>{" "}
          天 · 共{" "}
          <strong className="font-medium text-ink">
            {mode === "month" ? monthCalendarData.meals : yearCalendarData.meals}
          </strong>{" "}
          餐
        </div>
      </div>

      {/* ── 视图内容 ────────────────────────────────────────── */}
      {mode === "month" ? (
        /* 月历大网格视图 */
        <div className="mt-4 rounded-2xl border border-line bg-card p-4 shadow-2xs">
          {/* 星期表头 */}
          <div className="grid grid-cols-7 gap-1.5 pb-2 text-center text-[11px] font-medium text-ink-3 border-b border-line-2/40">
            {DAYS_OF_WEEK.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* 日历格子 */}
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {monthCalendarData.cells.map((cell, idx) => {
              if (!cell.isCurrentMonth) {
                return <div key={`empty-${idx}`} className="h-14 rounded-lg bg-transparent" />;
              }

              const isFuture = cell.dateStr > today;
              const isToday = cell.dateStr === today;

              // 纸墨层级色阶
              let cellBg = "bg-paper/70 text-ink-2";
              if (cell.mealCount === 1) cellBg = "bg-[#a3c4b2] text-ink";
              else if (cell.mealCount === 2) cellBg = "bg-[#5d9476] text-white";
              else if (cell.mealCount >= 3) cellBg = "bg-[#2e6349] text-white";

              return (
                <div
                  key={cell.dateStr}
                  className={cn(
                    "relative flex h-14 flex-col justify-between rounded-lg p-1.5 transition select-none",
                    isFuture ? "bg-paper-2/40 text-ink-3/40" : cellBg,
                    isToday && "ring-1.5 ring-accent",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium leading-none tabular-nums">
                      {cell.dayNum}
                    </span>
                    {cell.hasReview && (
                      <span className="size-1.5 rounded-full bg-caramel ring-1 ring-card" />
                    )}
                  </div>

                  {!isFuture && cell.mealCount > 0 && (
                    <div className="text-[9.5px] leading-tight opacity-90 tabular-nums">
                      <span>{cell.mealCount}餐</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 图例 */}
          <div className="mt-4 flex items-center justify-end gap-1.5 text-[9.5px] text-ink-3 border-t border-line-2/40 pt-3">
            <span>未做饭</span>
            <div className="size-2.5 rounded bg-paper border border-line" />
            <div className="size-2.5 rounded bg-[#a3c4b2]" />
            <div className="size-2.5 rounded bg-[#5d9476]" />
            <div className="size-2.5 rounded bg-[#2e6349]" />
            <span>多次做饭</span>
          </div>
        </div>
      ) : (
        /* 年视图：12 个迷你月份热力矩阵排列 */
        <div className="mt-4 grid grid-cols-2 gap-3">
          {yearCalendarData.months.map((m) => (
            <div
              key={m.month}
              className="rounded-xl border border-line bg-card p-3 shadow-2xs"
            >
              <div className="flex items-center justify-between pb-1.5 text-[11px]">
                <span className="font-display font-medium text-ink">{m.month} 月</span>
                <span className="text-[9.5px] text-ink-3 tabular-nums">
                  {m.cookDays > 0 ? `${m.cookDays} 天` : "未做饭"}
                </span>
              </div>

              {/* 7 列流式紧凑矩阵 */}
              <div className="grid grid-cols-7 gap-1 pt-1">
                {m.days.map((d, i) => {
                  if (d.dayNum === 0) {
                    return <div key={`empty-${m.month}-${i}`} className="size-[10px]" />;
                  }

                  const isFuture = d.dateStr > today;
                  let cellBg = "bg-[#ebe4d5]";
                  if (d.count === 1) cellBg = "bg-[#a3c4b2]";
                  else if (d.count === 2) cellBg = "bg-[#5d9476]";
                  else if (d.count >= 3) cellBg = "bg-[#2e6349]";

                  return (
                    <div
                      key={d.dateStr}
                      title={`${d.dateStr}: ${d.count} 餐`}
                      className={cn(
                        "size-[10px] rounded-[1.5px] transition",
                        isFuture ? "bg-line/20" : cellBg,
                      )}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
