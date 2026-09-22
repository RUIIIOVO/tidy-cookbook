import type { Dish } from "@/data/types";
import { difficultyLabel } from "@/lib/theme";

export function Meta({ dish }: { dish: Dish }) {
  return (
    <div className="flex items-center gap-2 text-[10.5px] text-ink-3">
      <span className="tabular-nums">{dish.minutes} 分钟</span>
      <span className="text-line-2">/</span>
      <span>{difficultyLabel[dish.difficulty]}</span>
      {dish.tags[0] && (
        <>
          <span className="text-line-2">/</span>
          <span>{dish.tags[0]}</span>
        </>
      )}
    </div>
  );
}
