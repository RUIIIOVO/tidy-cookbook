"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CaretLeft, CaretRight, Star } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useHeatmap } from "@/lib/heatmap-store";
import { addDays, diffDays } from "@/lib/meal-time";
import { useCart } from "@/lib/store";
import { useBackClose } from "@/lib/use-back-close";
import { cn, haptic } from "@/lib/utils";
import { HEAT_BG, HEAT_HINT, HeatLegend, HeatmapGrid, heatLevel, mondayOf } from "./heatmap-grid";

const DAYS_OF_WEEK = ["一", "二", "三", "四", "五", "六", "日"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 下厨日历：订单页里的全屏子页面（从右侧推入）。
 * 和订单页共用登录态与数据；点有订单的某一天 → 关闭本页并在订单列表里定位到那天。
 */
export function HeatmapDetail({
  onClose,
  onJump,
}: {
  onClose: () => void;
  onJump: (date: string) => void;
}) {
  const today = useCart((s) => s.today);
  const data = useHeatmap((s) => s.data);
  const ensureYear = useHeatmap((s) => s.ensureYear);

  const [mode, setMode] = useState<"month" | "year">("month");
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)));

  useBackClose(true, onClose);

  useEffect(() => {
    void ensureYear(year);
  }, [year, ensureYear]);

  const shift = (delta: number) => {
    haptic(4);
    if (mode === "year") {
      setYear((y) => y + delta);
      return;
    }
    const idx = year * 12 + (month - 1) + delta;
    setYear(Math.floor(idx / 12));
    setMonth((idx % 12) + 1);
  };

  // 左右滑动切换月 / 年；从可横向滚动的区域（全年长卷）开始的滑动不算
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-swipe]")) return;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current;
    touch.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx > 0 ? -1 : 1);
  };

  const pickDay = (date: string) => {
    if (date > today) return;
    if (!data[date]?.mealCount) {
      toast("这天没下厨");
      return;
    }
    haptic(6);
    onJump(date);
  };

  // ── 月视图 ──
  const monthView = useMemo(() => {
    const first = `${year}-${pad(month)}-01`;
    const total = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const lead = diffDays(mondayOf(first), first);
    const days = Array.from({ length: total }, (_, i) => {
      const date = addDays(first, i);
      return { date, day: i + 1, stat: date <= today ? data[date] : undefined };
    });
    const cooked = days.filter((d) => (d.stat?.mealCount ?? 0) > 0);
    const cookDays = cooked.length;
    const meals = cooked.reduce((n, d) => n + (d.stat?.mealCount ?? 0), 0);
    const dishes = cooked.reduce((n, d) => n + (d.stat?.dishCount ?? 0), 0);
    return { lead, days, cookDays, meals, dishes };
  }, [year, month, data, today]);

  // ── 年视图 ──
  const yearView = useMemo(() => {
    const jan1 = `${year}-01-01`;
    const weeks = Math.ceil((diffDays(mondayOf(jan1), `${year}-12-31`) + 1) / 7);
    const months = Array.from({ length: 12 }, (_, m) => {
      const first = `${year}-${pad(m + 1)}-01`;
      const total = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      const days = Array.from({ length: total }, (_, i) => {
        const date = addDays(first, i);
        const stat = date <= today ? data[date] : undefined;
        return { date, meals: stat?.mealCount ?? 0, dishes: stat?.dishCount ?? 0 };
      });
      const cooked = days.filter((d) => d.meals > 0);
      return {
        month: m + 1,
        lead: diffDays(mondayOf(first), first),
        days,
        // 这个月还没到：卡片调淡，右上角不写数
        future: first > today,
        cookDays: cooked.length,
        meals: cooked.reduce((n, d) => n + d.meals, 0),
        dishes: cooked.reduce((n, d) => n + d.dishes, 0),
      };
    });
    const cookDays = months.reduce((n, m) => n + m.cookDays, 0);
    const meals = months.reduce((n, m) => n + m.meals, 0);
    const dishes = months.reduce((n, m) => n + m.dishes, 0);
    return { jan1, weeks, months, cookDays, meals, dishes };
  }, [year, data, today]);

  // 全年长卷默认滚到当前月附近
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || mode !== "year") return;
    el.scrollLeft = String(year) === today.slice(0, 4) ? el.scrollWidth : 0;
  }, [mode, year, today]);

  const stats = mode === "month" ? monthView : yearView;
  const inYear = (d: string) => d.startsWith(`${year}-`);

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 40 }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-0 z-50 mx-auto flex max-w-[520px] flex-col overflow-hidden bg-paper select-none"
    >
      {/* 顶栏：吸顶 */}
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-paper px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="返回"
            onClick={() => {
              haptic(4);
              onClose();
            }}
            className="-ml-1.5 grid size-8 place-items-center rounded-full text-ink transition active:bg-paper-2"
          >
            <ArrowLeft size={19} />
          </button>
          <h1 className="font-display text-[20px] tracking-wider text-ink">下厨日历</h1>
        </div>

        {/* 月 / 年：滑块平移，和底部导航一致 */}
        <div className="relative flex rounded-full border border-line bg-card p-1">
          <motion.span
            initial={false}
            animate={{ x: mode === "month" ? 0 : 44 }}
            transition={{ type: "spring", stiffness: 480, damping: 38 }}
            className="pointer-events-none absolute inset-y-1 left-1 w-11 rounded-full bg-accent"
          />
          {(["month", "year"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                haptic(4);
                setMode(m);
              }}
              className={cn(
                "relative w-11 py-1 text-center text-[12px] font-medium transition-colors",
                mode === m ? "text-white" : "text-ink-3",
              )}
            >
              {m === "month" ? "月" : "年"}
            </button>
          ))}
        </div>
      </header>

      {/* 滚动只发生在 header 下面，滚动条不会盖到 header */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {/* 时间切换 + 三项统计 */}
        <div className="rounded-xl border border-line bg-card shadow-2xs">
          <div className="flex items-center justify-between px-3 py-2.5">
            <button type="button" aria-label="上一个" onClick={() => shift(-1)} className="grid size-7 place-items-center rounded-md bg-paper text-ink active:scale-90">
              <CaretLeft size={14} />
            </button>
            {/* 透明的原生选择器铺在文字上，点日期即弹出系统年月选择 */}
            <label className="relative px-2">
              <span className="font-display text-[16px] tracking-wide text-ink tabular-nums">
                {mode === "month" ? `${year} 年 ${month} 月` : `${year} 年`}
              </span>
              <input
                type="month"
                value={`${year}-${pad(month)}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-").map(Number);
                  if (!y || !m) return;
                  haptic(6);
                  setYear(y);
                  setMonth(m);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <button type="button" aria-label="下一个" onClick={() => shift(1)} className="grid size-7 place-items-center rounded-md bg-paper text-ink active:scale-90">
              <CaretRight size={14} />
            </button>
          </div>
          <div className="flex divide-x divide-line border-t border-line">
            {(
              [
                ["下厨天数", stats.cookDays],
                ["做饭餐数", stats.meals],
                ["菜品数量", stats.dishes],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="flex-1 py-2.5 text-center tabular-nums">
                <p className="font-display text-[20px] leading-none text-ink">{n}</p>
                <p className="mt-1.5 text-[10.5px] text-ink-3">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {mode === "month" ? (
          <div className="mt-4 rounded-2xl border border-line bg-card p-3.5 shadow-2xs">
            <div className="grid grid-cols-7 gap-1.5 border-b border-line/50 pb-2 text-center text-[11px] text-ink-3">
              {DAYS_OF_WEEK.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="mt-2.5 grid grid-cols-7 gap-1.5">
              {Array.from({ length: monthView.lead }, (_, i) => (
                <span key={`lead-${i}`} />
              ))}
              {monthView.days.map(({ date, day, stat }) => {
                const future = date > today;
                const dishes = future ? 0 : (stat?.dishCount ?? 0);
                const lv = heatLevel(dishes);
                return (
                  // 固定三行：日期 / N道 / 星级。「N道」和星级各占固定的一行，有没有评价都不会挤成两行或错位
                  <button
                    key={date}
                    type="button"
                    disabled={future}
                    onClick={() => pickDay(date)}
                    className={cn(
                      "flex h-[60px] flex-col rounded-lg p-1.5 text-left whitespace-nowrap transition active:scale-95",
                      future ? "bg-paper-2/40 text-ink-3/40" : HEAT_BG[lv],
                      // 最浅的绿色上白字对比度只有约 3:1，这一档改深色字
                      lv === 1 ? "text-ink" : lv >= 2 ? "text-white" : !future && "text-ink-2",
                      date === today && "ring-2 ring-accent ring-offset-1 ring-offset-card",
                    )}
                  >
                    <span className="text-[11px] leading-none font-medium tabular-nums">{day}</span>
                    <span className="mt-auto block h-[11px] text-[9.5px] leading-[11px] tabular-nums">
                      {dishes > 0 ? `${dishes}道` : ""}
                    </span>
                    <span className="flex h-[11px] items-center gap-px text-[9.5px] leading-[11px] tabular-nums">
                      {!future && stat?.avgRating != null && (
                        <>
                          <Star size={9} weight="fill" />
                          {stat.avgRating}
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <HeatLegend hint={HEAT_HINT} className="mt-3.5 border-t border-line/50 pt-3" />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {/* 全年总览：与订单页同一套网格，固定格子大小，横向可滚 */}
            <div className="rounded-2xl border border-line bg-card p-3.5 shadow-2xs">
              <div className="flex items-center justify-between pb-2.5 text-[11px] text-ink-3">
                <span className="font-display text-[13px] text-ink">{year} 全年</span>
                <HeatLegend />
              </div>
              <div ref={scrollRef} data-no-swipe className="no-scrollbar overflow-x-auto">
                <div className="w-max">
                  <HeatmapGrid
                    start={yearView.jan1}
                    weeks={yearView.weeks}
                    today={today}
                    data={data}
                    cellSize={11}
                    inRange={inYear}
                    onSelectDate={pickDay}
                  />
                </div>
              </div>
            </div>

            {/* 12 个月：点击进入该月 */}
            <div className="grid grid-cols-2 gap-3">
              {yearView.months.map((m) => (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => {
                    haptic(6);
                    setMonth(m.month);
                    setMode("month");
                  }}
                  className={cn(
                    "flex flex-col justify-start rounded-xl border border-line bg-card p-3 text-left shadow-2xs transition active:scale-[0.98]",
                    m.future && "opacity-55",
                  )}
                >
                  <div className="flex items-center justify-between pb-2">
                    <span className="font-display text-[13px] text-ink">{m.month} 月</span>
                    {!m.future && (
                      <span className={cn("text-[10px] tabular-nums", m.cookDays > 0 ? "text-ink-3" : "text-ink-3/60")}>
                        {m.cookDays} 天 · {m.meals} 餐
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-7 gap-[3px]">
                    {Array.from({ length: m.lead }, (_, i) => (
                      <span key={`l-${i}`} />
                    ))}
                    {m.days.map(({ date, dishes }) => (
                      <span
                        key={date}
                        className={cn(
                          "aspect-square rounded-[2px]",
                          date > today ? "bg-line/25" : HEAT_BG[heatLevel(dishes)],
                        )}
                      />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </motion.div>
  );
}
