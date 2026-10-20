"use client";

import type { Dish } from "@/data/types";
import { useCart } from "@/lib/store";

/** 列表卡片的元信息：展示历史点单次数 + 标签 */
export function Meta({ dish }: { dish: Dish }) {
  const count = useCart((s) => s.stats[dish.id] || 0);
  const tags = dish.tags.slice(0, count > 0 ? 1 : 2);

  return (
    <div className="flex items-center gap-1.5">
      {count > 0 && (
        <span className="rounded-full bg-caramel-soft px-2 py-0.5 text-[10px] font-medium text-caramel tabular-nums">
          已售 {count}
        </span>
      )}
      {tags.map((t) => (
        <span
          key={t}
          className="rounded-full bg-paper-2 px-2 py-0.5 text-[10.5px] text-ink-3"
        >
          {t}
        </span>
      ))}
    </div>
  );
}
