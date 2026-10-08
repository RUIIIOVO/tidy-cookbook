"use client";

import type { Dish } from "@/data/types";

/** 列表卡片的元信息：只显示标签（最多两个） */
export function Meta({ dish }: { dish: Dish }) {
  const tags = dish.tags.slice(0, 2);
  if (tags.length === 0) return <div />;
  return (
    <div className="flex items-center gap-1.5">
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
