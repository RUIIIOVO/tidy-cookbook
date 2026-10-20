"use client";

import { useEffect, useMemo } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { useHeatmap } from "@/lib/heatmap-store";
import { addDays } from "@/lib/meal-time";
import { useCart } from "@/lib/store";
import { haptic } from "@/lib/utils";
import { HeatLegend, HeatmapGrid, mondayOf } from "./heatmap-grid";

const WEEKS = 13; // 近 13 周（约 90 天），最后一列是本周

/** 订单页「全部」顶部的下厨记录卡片 */
export function CookingHeatmap({
  onSelectDate,
  onOpenDetail,
}: {
  onSelectDate: (date: string) => void;
  onOpenDetail: () => void;
}) {
  const today = useCart((s) => s.today);
  const data = useHeatmap((s) => s.data);
  const ensureYear = useHeatmap((s) => s.ensureYear);

  const start = today ? addDays(mondayOf(today), -(WEEKS - 1) * 7) : "";

  // 近 13 周可能跨年（1~3 月），两年都要拉
  useEffect(() => {
    if (!start) return;
    void ensureYear(Number(start.slice(0, 4)));
    void ensureYear(Number(today.slice(0, 4)));
  }, [start, today, ensureYear]);

  const { cookDays, meals, dishes } = useMemo(() => {
    let cookDays = 0;
    let meals = 0;
    let dishes = 0;
    if (!start) return { cookDays, meals, dishes };
    for (let i = 0; i < WEEKS * 7; i++) {
      const d = addDays(start, i);
      if (d > today) break;
      const n = data[d]?.mealCount ?? 0;
      if (n > 0) {
        cookDays += 1;
        meals += n;
        dishes += data[d]?.dishCount ?? 0;
      }
    }
    return { cookDays, meals, dishes };
  }, [start, today, data]);

  if (!today) return null;

  const open = () => {
    haptic(4);
    onOpenDetail();
  };

  return (
    <div className="rounded-card border border-line bg-card p-4 shadow-2xs">
      <div className="flex items-center justify-between pb-3 text-[11px] text-ink-3">
        <button type="button" onClick={open} className="font-display text-[14px] tracking-wider text-ink">
          下厨记录
        </button>
        <span className="tabular-nums">
          近 90 天下厨 <strong className="font-medium text-ink">{cookDays}</strong> 天 ·{" "}
          <strong className="font-medium text-ink">{meals}</strong> 餐 ·{" "}
          <strong className="font-medium text-ink">{dishes}</strong> 道菜
        </span>
      </div>

      <HeatmapGrid start={start} weeks={WEEKS} today={today} data={data} onSelectDate={onSelectDate} />

      <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-2.5">
        <button
          type="button"
          onClick={open}
          className="flex items-center gap-0.5 text-[11px] font-medium text-accent"
        >
          查看日历
          <CaretRight size={10} />
        </button>
        <HeatLegend />
      </div>
    </div>
  );
}
