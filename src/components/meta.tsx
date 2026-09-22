"use client";

import type { Dish } from "@/data/types";
import { metaIcon } from "@/lib/icons";
import { difficultyLabel } from "@/lib/theme";

export function Meta({ dish }: { dish: Dish }) {
  const Clock = metaIcon.time;
  const Hat = metaIcon.difficulty;
  return (
    <div className="flex items-center gap-2.5 text-[10.5px] text-ink-3">
      <span className="flex items-center gap-1">
        <Clock size={12} weight="regular" />
        <span className="tabular-nums">{dish.minutes}</span> 分钟
      </span>
      <span className="flex items-center gap-1">
        <Hat size={12} weight="regular" />
        {difficultyLabel[dish.difficulty]}
      </span>
    </div>
  );
}
