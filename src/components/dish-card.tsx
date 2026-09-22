"use client";

import type { Dish } from "@/data/types";
import { catTheme } from "@/lib/theme";
import { useDishSheet } from "@/lib/ui-store";
import { AddButton } from "./add-button";
import { DishThumb } from "./dish-thumb";
import { Meta } from "./meta";

export function DishCard({ dish }: { dish: Dish }) {
  const open = useDishSheet((s) => s.open);
  const t = catTheme[dish.category];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(dish.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(dish.id);
        }
      }}
      className="group flex w-full cursor-pointer items-stretch gap-3 rounded-card border border-line bg-card p-2.5 text-left transition active:border-line-2 active:bg-paper"
    >
      <DishThumb dish={dish} className="size-[76px] shrink-0 rounded-[10px]" />

      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <h3 className="truncate font-display text-[16px] leading-tight tracking-wide text-ink">
              {dish.name}
            </h3>
            {dish.spicy > 0 && (
              <span className="flex shrink-0 items-center gap-[2px]" title={`辣度 ${dish.spicy}`}>
                {Array.from({ length: dish.spicy }).map((_, i) => (
                  <span
                    key={i}
                    className="size-[4px] rounded-full"
                    style={{ background: t.hex, opacity: 0.75 }}
                  />
                ))}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.55] text-ink-3">
            {dish.desc}
          </p>
        </div>

        <div className="mt-1.5 flex items-center justify-between">
          <Meta dish={dish} />
          <AddButton dish={dish} />
        </div>
      </div>
    </div>
  );
}
