"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useHeatmap } from "@/lib/heatmap-store";
import { useCart } from "@/lib/store";
import { cn, haptic } from "@/lib/utils";

const DAYS_OF_WEEK = ["一", "二", "三", "四", "五", "六", "日"];

export function HeatmapDetailView() {
  const today = useCart((s) => s.today) || new Date().toISOString().slice(0, 10);
  const data = useHeatmap((s) => s.data);

  // 模式：月 (month) 或 年 (year)
  const [mode, setMode] = useState<"month" | "year">("month");

  // 选中的年份与月份
  const [selectedYear, setSelectedYear] = useState(() => parseInt(today.slice(0, 4), 10));
  const [selectedMonth, setSelectedMonth] = useState(() => parseInt(today.slice(5, 7), 10));

  // 滑动手势支持（左右划切换月/年）
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) {
        if (mode === "month") handlePrevMonth();
        else handlePrevYear();
      } else {
        if (mode === "month") handleNextMonth();
        else handleNextYear();
      }
    }
  };

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

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const totalDays = lastDay.getDate();
    const startWeekday = (firstDay.getDay() + 6) % 7;

    const cells: {
      dayNum: number;
      dateStr: string;
      isCurrentMonth: boolean;
      mealCount: number;
      dishCount: number;
      hasReview: boolean;
    }[] = [];

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

  // ── 年视图数据计算（年度宏观长卷 + 12 个月份拆解） ─────────────
  const yearCalendarData = useMemo(() => {
    const year = selectedYear;
    const monthsData = [];

    let yearCookDays = 0;
    let yearMeals = 0;

    const fullYearDays: { dateStr: string; count: number; inFuture: boolean }[] = [];

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
        const inFuture = dateStr > today;

        if (count > 0 && !inFuture) {
          mCookDays += 1;
          mMeals += count;
        }

        days.push({
          dayNum: d,
          dateStr,
          count,
          hasReview,
        });

        fullYearDays.push({
          dateStr,
          count,
          inFuture,
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
      fullYearDays,
      cookDays: yearCookDays,
      meals: yearMeals,
    };
  }, [selectedYear, data, today]);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="flex min-h-dvh flex-col bg-paper px-4 pt-4 pb-16 select-none"
    >
      {/* 顶栏导航：sticky 吸顶，背景带高斯模糊，不被内容顶走 */}
      <header className="sticky top-0 z-30 -mx-4 flex items-center justify-between border-b border-line bg-paper/90 px-4 pb-3 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <Link
            href="/history/"
            onClick={() => haptic(4)}
            className="flex items-center justify-center text-ink transition active:scale-90"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-display text-[20px] tracking-wider text-ink">下厨详情</h1>
        </div>

        {/* 月 / 年 维度切换：平移动效 */}
        <div className="relative flex rounded-full border border-line bg-card p-1">
          <motion.div
            initial={false}
            animate={{ x: mode === "month" ? 0 : 44 }}
            transition={{ type: "spring", stiffness: 480, damping: 38 }}
            className="pointer-events-none absolute inset-y-1 left-1 w-11 rounded-full bg-accent"
          />
          <button
            type="button"
            onClick={() => {
              haptic(4);
              setMode("month");
            }}
            className={cn(
              "relative z-10 w-11 py-1 text-center text-[12px] font-medium transition-colors",
              mode === "month" ? "text-white" : "text-ink-3 hover:text-ink",
            )}
          >
            月
          </button>
          <button
            type="button"
            onClick={() => {
              haptic(4);
              setMode("year");
            }}
            className={cn(
              "relative z-10 w-11 py-1 text-center text-[12px] font-medium transition-colors",
              mode === "year" ? "text-white" : "text-ink-3 hover:text-ink",
            )}
          >
            年
          </button>
        </div>
      </header>

      {/* 控制条：时间前进后退与统计 */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-card px-4 py-2.5 shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={mode === "month" ? handlePrevMonth : handlePrevYear}
            className="flex size-7 items-center justify-center rounded-md bg-paper text-ink transition active:scale-90"
          >
            <CaretLeft size={14} />
          </button>

          {/* 点击日期文字可唤起系统日期/年月选择器，已移除下划线 */}
          <div className="relative flex items-center">
            <span className="font-display text-[15px] tracking-wide text-ink tabular-nums cursor-pointer">
              {mode === "month" ? `${selectedYear} 年 ${selectedMonth} 月` : `${selectedYear} 年`}
            </span>
            <input
              type="month"
              value={`${selectedYear}-${String(selectedMonth).padStart(2, "0")}`}
              onChange={(e) => {
                if (!e.target.value) return;
                const [y, m] = e.target.value.split("-").map(Number);
                if (y && m) {
                  haptic(6);
                  setSelectedYear(y);
                  setSelectedMonth(m);
                }
              }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>

          <button
            type="button"
            onClick={mode === "month" ? handleNextMonth : handleNextYear}
            className="flex size-7 items-center justify-center rounded-md bg-paper text-ink transition active:scale-90"
          >
            <CaretRight size={14} />
          </button>
        </div>

        {/* 统计指标：共下厨 XX 天 */}
        <div className="text-[11.5px] text-ink-3 tabular-nums">
          共下厨{" "}
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

          {/* 日历大格子 */}
          <div className="mt-2.5 grid grid-cols-7 gap-1.5">
            {monthCalendarData.cells.map((cell, idx) => {
              if (!cell.isCurrentMonth) {
                return <div key={`empty-${idx}`} className="h-15 rounded-lg bg-transparent" />;
              }

              const isFuture = cell.dateStr > today;
              const isToday = cell.dateStr === today;

              let cellBg = "bg-paper/70 text-ink-2";
              if (cell.mealCount === 1) cellBg = "bg-[#6b9e7f] text-white";
              else if (cell.mealCount === 2) cellBg = "bg-[#457c5f] text-white";
              else if (cell.mealCount >= 3) cellBg = "bg-[#2e6349] text-white";

              return (
                <div
                  key={cell.dateStr}
                  className={cn(
                    "relative flex h-15 flex-col justify-between rounded-lg p-1.5 transition select-none",
                    isFuture ? "bg-paper-2/40 text-ink-3/40" : cellBg,
                    isToday && "ring-2 ring-accent",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium leading-none tabular-nums">
                      {cell.dayNum}
                    </span>
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

          {/* 底部图例 */}
          <div className="mt-4 flex items-center justify-end gap-1.5 text-[9.5px] text-ink-3 border-t border-line-2/40 pt-3">
            <span>少</span>
            <div className="size-2 rounded bg-[#e4e2dc]" />
            <div className="size-2 rounded bg-[#6b9e7f]" />
            <div className="size-2 rounded bg-[#457c5f]" />
            <div className="size-2 rounded bg-[#2e6349]" />
            <span>多</span>
          </div>
        </div>
      ) : (
        /* 年视图：顶部全年 52 周总览长卷 + 下方 12 个可点击直达的月份矩阵 */
        <div className="mt-4 flex flex-col gap-4">
          {/* 全年 365 天宏观长卷 */}
          <div className="rounded-2xl border border-line bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between pb-2 text-[11px] text-ink-3">
              <span className="font-display text-ink">{selectedYear} 全年做饭分布</span>
              <span className="tabular-nums">共下厨 {yearCalendarData.cookDays} 天</span>
            </div>
            <div className="overflow-x-auto pt-1 pb-1">
              <div className="grid grid-flow-col grid-rows-7 gap-1 min-w-fit">
                {yearCalendarData.fullYearDays.map((d) => {
                  let bg = "bg-[#e4e2dc]";
                  if (d.inFuture) bg = "bg-line/20";
                  else if (d.count === 1) bg = "bg-[#6b9e7f]";
                  else if (d.count === 2) bg = "bg-[#457c5f]";
                  else if (d.count >= 3) bg = "bg-[#2e6349]";

                  return (
                    <div
                      key={d.dateStr}
                      title={`${d.dateStr}: ${d.count} 餐`}
                      className={cn("size-[9px] rounded-[1.5px]", bg)}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* 12 个月份卡片：点击月份直接跳转到该月详情 */}
          <div className="grid grid-cols-2 gap-3">
            {yearCalendarData.months.map((m) => (
              <div
                key={m.month}
                role="button"
                tabIndex={0}
                onClick={() => {
                  haptic(6);
                  setSelectedMonth(m.month);
                  setMode("month");
                }}
                className="group rounded-xl border border-line bg-card p-3 shadow-2xs transition active:scale-[0.98] hover:border-accent cursor-pointer"
              >
                <div className="flex items-center justify-between pb-1.5 text-[11px]">
                  <span className="font-display font-medium text-ink group-hover:text-accent transition-colors">
                    {m.month} 月 ›
                  </span>
                  <span className="text-[9.5px] text-ink-3 tabular-nums">
                    {m.cookDays > 0 ? `${m.cookDays} 天` : "未做饭"}
                  </span>
                </div>

                {/* 7 列月份微缩图 */}
                <div className="grid grid-cols-7 gap-1 pt-1">
                  {m.days.map((d, i) => {
                    if (d.dayNum === 0) {
                      return <div key={`empty-${m.month}-${i}`} className="size-[10px]" />;
                    }

                    const isFuture = d.dateStr > today;
                    let cellBg = "bg-[#e4e2dc]";
                    if (d.count === 1) cellBg = "bg-[#6b9e7f]";
                    else if (d.count === 2) cellBg = "bg-[#457c5f]";
                    else if (d.count >= 3) cellBg = "bg-[#2e6349]";

                    return (
                      <div
                        key={d.dateStr}
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
        </div>
      )}
    </div>
  );
}
