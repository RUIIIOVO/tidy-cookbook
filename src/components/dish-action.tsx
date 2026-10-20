"use client";

import type { Dish } from "@/data/types";
import { CUSTOM_CONFIGS } from "@/data/custom-options";
import { useCustomModal } from "@/lib/custom-modal-store";
import { AddButton } from "./add-button";

/**
 * 菜品行右侧的点单按钮：能选规格的菜是「选规格」，其余是「+」（点过就变数量加减）。
 * 菜单卡片和排行榜共用，两处行为一致。
 */
export function DishAction({ dish }: { dish: Dish }) {
  const openCustom = useCustomModal((s) => s.open);
  if (CUSTOM_CONFIGS[dish.id]) {
    return (
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
    );
  }
  return <AddButton dish={dish} />;
}
