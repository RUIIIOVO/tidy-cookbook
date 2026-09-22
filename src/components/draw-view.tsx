"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowsClockwise, DiceFive } from "@phosphor-icons/react";
import { toast } from "sonner";
import { categories, dishes } from "@/data/dishes";
import type { CategoryId, Dish } from "@/data/types";
import { catTheme, difficultyLabel, spicyLabel } from "@/lib/theme";
import { useCart } from "@/lib/store";
import { useDishSheet } from "@/lib/ui-store";
import { cn, haptic } from "@/lib/utils";
import { DishSheet } from "./dish-sheet";
import { DishThumb } from "./dish-thumb";

type Filter = "all" | CategoryId;

const FILTERS: { id: Filter; name: string }[] = [
  { id: "all", name: "全部" },
  ...categories.map((c) => ({ id: c.id as Filter, name: c.name })),
];

export function DrawView() {
  const [filter, setFilter] = useState<Filter>("all");
  const [dish, setDish] = useState<Dish | null>(null);
  const [rolling, setRolling] = useState(false);
  const historyRef = useRef<string[]>([]);
  const add = useCart((s) => s.add);
  const openSheet = useDishSheet((s) => s.open);

  const pool = filter === "all" ? dishes : dishes.filter((d) => d.category === filter);

  const roll = useCallback(() => {
    haptic(15);
    setRolling(true);
    let ticks = 0;
    const timer = setInterval(() => {
      const recent = historyRef.current.slice(-Math.min(8, pool.length - 1));
      const candidates = pool.filter((d) => !recent.includes(d.id));
      const next = (candidates.length ? candidates : pool)[
        Math.floor(Math.random() * (candidates.length ? candidates.length : pool.length))
      ];
      setDish(next);
      ticks++;
      if (ticks >= 7) {
        clearInterval(timer);
        setRolling(false);
        historyRef.current.push(next.id);
        haptic(25);
      }
    }, 70);
  }, [pool]);

  const t = dish ? catTheme[dish.category] : catTheme.meat;

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col px-5 pt-16">
      <header>
        <p className="text-[11px] tracking-[0.3em] text-ink-3">TODAY&apos;S PICK</p>
        <h1 className="mt-1.5 font-display text-[28px] leading-tight tracking-wider text-ink">
          今天吃什么
        </h1>
      </header>

      <div className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              haptic(6);
              setFilter(f.id);
            }}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] transition",
              filter === f.id
                ? "border-ink bg-ink text-paper"
                : "border-line bg-card text-ink-2",
            )}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className="mt-6 flex-1">
        {dish ? (
          <button
            type="button"
            onClick={() => !rolling && openSheet(dish.id)}
            className={cn(
              "block w-full overflow-hidden rounded-2xl border border-line bg-card text-left transition",
              rolling && "opacity-95",
            )}
          >
            <DishThumb
              dish={dish}
              className="aspect-[16/10] w-full"
              sizes="100vw"
              priority
              variant="lg"
            />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-[22px] leading-tight tracking-wider text-ink">
                  {dish.name}
                </h2>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] ${t.bg} ${t.text}`}
                >
                  {dish.tags[0] ?? "家常"}
                </span>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{dish.desc}</p>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-3">
                <span className="tabular-nums">{dish.minutes} 分钟</span>
                <span className="text-line-2">/</span>
                <span>{difficultyLabel[dish.difficulty]}</span>
                <span className="text-line-2">/</span>
                <span>{spicyLabel[dish.spicy]}</span>
                <span className="ml-auto text-ink-3">点开看做法 →</span>
              </div>
            </div>
          </button>
        ) : (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-line-2 text-center">
            <DiceFive size={30} weight="duotone" className="text-line-2" />
            <p className="mt-3 font-display text-[15px] tracking-wider text-ink-3">
              抽一道，省得纠结
            </p>
            <p className="mt-1 text-[11px] text-ink-3">
              共 <span className="tabular-nums">{pool.length}</span> 道可选
            </p>
          </div>
        )}
      </div>

      <div className="sticky bottom-3 mt-5 flex gap-2.5 pb-3">
        <button
          type="button"
          onClick={roll}
          disabled={rolling}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-[14px] tracking-wide text-paper transition active:scale-[0.98] disabled:opacity-60"
        >
          <ArrowsClockwise size={16} weight="bold" className={rolling ? "animate-spin" : ""} />
          {dish ? "换一道" : "开始抽菜"}
        </button>
        {dish && (
          <button
            type="button"
            onClick={() => {
              haptic();
              add(dish.id);
              toast(`已加入 · ${dish.name}`);
            }}
            className="rounded-full border border-chili/30 bg-chili-soft px-6 py-3.5 text-[14px] tracking-wide text-chili transition active:scale-[0.98]"
          >
            就它了
          </button>
        )}
      </div>

      <DishSheet />
    </div>
  );
}
