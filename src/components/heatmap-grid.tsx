"use client";

import { useMemo } from "react";
import type { HeatmapDay } from "@/lib/heatmap-store";
import { addDays } from "@/lib/meal-time";
import { cn, haptic } from "@/lib/utils";

/** 色阶：0 餐 / 1 餐 / 2 餐 / 3 餐及以上。订单页、下厨详情、图例共用这一份 */
export const HEAT_BG = ["bg-[#e4e2dc]", "bg-[#6b9e7f]", "bg-[#457c5f]", "bg-[#2e6349]"] as const;
export const heatLevel = (count: number) => Math.min(3, Math.max(0, count));

/** 'YYYY-MM-DD' 所在周的周一 */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}

const WEEKDAY_LABEL: Record<number, string> = { 0: "一", 2: "三", 4: "五", 6: "日" };

export function HeatLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1 text-[9.5px] text-ink-3", className)}>
      <span>少</span>
      {HEAT_BG.map((bg) => (
        <span key={bg} className={cn("size-[9px] rounded-[2px]", bg)} />
      ))}
      <span>多</span>
    </div>
  );
}

/**
 * GitHub 式热力网格：一列一周（周一到周日），从 start 所在周起共 weeks 列。
 * 月份行、星期列、格子放在同一个 CSS Grid 里，行高由格子决定，星期文字天然与格子对齐。
 * - cellSize 不传：格子平分宽度（订单页卡片）；传了：固定像素，超出横向滚动（全年）。
 * - inRange 返回 false 的日期留空（全年视图里不属于当年的那几天）。
 */
export function HeatmapGrid({
  start,
  weeks,
  today,
  data,
  cellSize,
  inRange,
  onSelectDate,
}: {
  start: string;
  weeks: number;
  today: string;
  data: Record<string, HeatmapDay>;
  cellSize?: number;
  inRange?: (date: string) => boolean;
  onSelectDate?: (date: string) => void;
}) {
  const monday = mondayOf(start);

  const months = useMemo(() => {
    // 每列取周一所在的月份，月份变了就在该列上方标一次；两个标签离得太近时丢掉前一个
    const raw: { col: number; label: string }[] = [];
    let last = "";
    for (let w = 0; w < weeks; w++) {
      const first = addDays(monday, w * 7);
      // 只在本列有在范围内的日期时才算
      const probe = inRange && !inRange(first) ? addDays(monday, w * 7 + 6) : first;
      if (inRange && !inRange(probe)) continue;
      const m = probe.slice(0, 7);
      if (m !== last) {
        raw.push({ col: w, label: `${Number(m.slice(5))}月` });
        last = m;
      }
    }
    return raw.filter((m, i) => !raw[i + 1] || raw[i + 1].col - m.col >= 3);
  }, [monday, weeks, inRange]);

  const col = cellSize ? `${cellSize}px` : "minmax(0,1fr)";

  return (
    <div
      className="grid gap-[3px]"
      style={{
        gridTemplateColumns: `14px repeat(${weeks}, ${col})`,
        gridTemplateRows: "auto repeat(7, auto)",
      }}
    >
      {/* 第 1 行：月份 */}
      {months.map((m) => (
        <span
          key={`${m.label}-${m.col}`}
          className="pb-1 text-[9px] leading-none whitespace-nowrap text-ink-3"
          style={{ gridRow: 1, gridColumn: m.col + 2 }}
        >
          {m.label}
        </span>
      ))}

      {/* 第 1 列：星期，和格子同一行，垂直居中即对齐 */}
      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
        <span
          key={d}
          // 横向滚动时星期列钉在左边；阴影把列间距也盖住，免得露出滚过去的格子
          className="sticky left-0 z-[1] flex items-center bg-card text-[8.5px] leading-none text-ink-3/80 shadow-[3px_0_0_var(--color-card)] select-none"
          style={{ gridRow: d + 2, gridColumn: 1 }}
        >
          {WEEKDAY_LABEL[d] ?? ""}
        </span>
      ))}

      {/* 格子 */}
      {Array.from({ length: weeks * 7 }, (_, i) => {
        const w = Math.floor(i / 7);
        const d = i % 7;
        const date = addDays(monday, i);
        const pos = { gridRow: d + 2, gridColumn: w + 2 };
        if (inRange && !inRange(date)) return <span key={date} style={pos} />;

        const base = "aspect-square w-full rounded-[2.5px]";
        if (date > today) {
          return <span key={date} style={pos} className={cn(base, "bg-line/25")} />;
        }
        const stat = data[date];
        const count = stat?.mealCount ?? 0;
        const title = `${date}：${count > 0 ? `${count} 餐` : "没下厨"}`;
        if (!onSelectDate) {
          return <span key={date} title={title} style={pos} className={cn(base, HEAT_BG[heatLevel(count)])} />;
        }
        return (
          <button
            key={date}
            type="button"
            title={title}
            style={pos}
            onClick={() => {
              haptic(6);
              onSelectDate(date);
            }}
            className={cn(base, HEAT_BG[heatLevel(count)], "transition active:scale-125")}
          />
        );
      })}
    </div>
  );
}
