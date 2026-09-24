"use client";

import type { Dish } from "@/data/types";
import { CUSTOM_CONFIGS } from "@/data/custom-options";
import { useCustomModal } from "@/lib/custom-modal-store";
import { useDishSheet } from "@/lib/ui-store";
import { AddButton } from "./add-button";
import { DishThumb } from "./dish-thumb";
import { Meta } from "./meta";

export function DishCard({ dish }: { dish: Dish }) {
  const open = useDishSheet((s) => s.open);
  const openCustom = useCustomModal((s) => s.open);
  const isCustomizable = !!CUSTOM_CONFIGS[dish.id];

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
          <h3 className="truncate font-display text-[16px] leading-tight tracking-wide text-ink">
            {dish.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.55] text-ink-3">
            {dish.desc}
          </p>
        </div>

        <div className="mt-1.5 flex items-center justify-between">
          <Meta dish={dish} />
          {isCustomizable ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openCustom(dish.id);
              }}
              className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium tracking-wide text-white shadow-2xs transition active:scale-95"
            >
              选规格
            </button>
          ) : (
            <AddButton dish={dish} />
          )}
        </div>
      </div>
    </div>
  );
}
