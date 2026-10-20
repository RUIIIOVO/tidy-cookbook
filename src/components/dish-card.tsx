"use client";

import type { Dish } from "@/data/types";
import { useDishSheet } from "@/lib/ui-store";
import { haptic } from "@/lib/utils";
import { DishAction } from "./dish-action";
import { DishThumb } from "./dish-thumb";
import { Meta } from "./meta";
import { RatingBadge } from "./rating-badge";

export function DishCard({ dish, priority }: { dish: Dish; priority?: boolean }) {
  const open = useDishSheet((s) => s.open);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        haptic(6);
        open(dish.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          haptic(6);
          open(dish.id);
        }
      }}
      className="group flex w-full cursor-pointer items-stretch gap-3 rounded-card border border-line bg-card p-2.5 text-left transition active:border-line-2 active:bg-paper"
    >
      <DishThumb dish={dish} priority={priority} className="size-[76px] shrink-0 rounded-[10px]" />

      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate font-display text-[16px] leading-tight tracking-wide text-ink">
              {dish.name}
            </h3>
            <RatingBadge dishId={dish.id} />
          </div>
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.55] text-ink-3">
            {dish.desc}
          </p>
        </div>

        <div className="mt-1.5 flex items-center justify-between">
          <Meta dish={dish} />
          <DishAction dish={dish} />
        </div>
      </div>
    </div>
  );
}
