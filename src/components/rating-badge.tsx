"use client";

import { Star } from "@phosphor-icons/react";
import { useDishRatings } from "@/lib/dish-rating-store";
import { cn } from "@/lib/utils";

/** 「★4.6」：这道菜被单独打过分才显示，没有就什么都不占 */
export function RatingBadge({ dishId, className }: { dishId: string; className?: string }) {
  const r = useDishRatings((s) => s.ratings[dishId]);
  if (!r) return null;
  return (
    <span
      title={`${r.n} 次评分`}
      className={cn("inline-flex shrink-0 items-center gap-0.5 text-[11.5px] font-medium text-ink-2 tabular-nums", className)}
    >
      <Star size={11} weight="fill" className="text-accent" />
      {r.avg.toFixed(1)}
    </span>
  );
}
