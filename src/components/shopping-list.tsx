"use client";

import { useMemo, useState } from "react";
import { Basket, Check, CopySimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Dish } from "@/data/types";
import { buildShoppingList } from "@/lib/shopping";
import { cn, haptic } from "@/lib/utils";

export function ShoppingList({ rows }: { rows: { dish: Dish; qty: number }[] }) {
  const groups = useMemo(() => buildShoppingList(rows), [rows]);
  const [done, setDone] = useState<string[]>([]);
  const [showSeasoning, setShowSeasoning] = useState(true);

  const buyGroups = groups.filter((g) => g.group !== "调料");
  const seasoning = groups.find((g) => g.group === "调料");
  const totalBuy = buyGroups.reduce((n, g) => n + g.items.length, 0);

  const copy = async () => {
    const text = groups
      .map(
        (g) =>
          `【${g.group}】\n` + g.items.map((i) => `${i.name} ${i.amount}`).join("\n"),
      )
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("清单已复制");
    } catch {
      toast("复制失败，长按选中吧");
    }
  };

  const toggle = (name: string) => {
    haptic(6);
    setDone((d) => (d.includes(name) ? d.filter((x) => x !== name) : [...d, name]));
  };

  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-center gap-2">
        <Basket size={16} weight="regular" className="text-ink" />
        <h2 className="font-display text-[15px] tracking-[0.22em] text-ink">买菜清单</h2>
        <span className="text-[10px] text-ink-3 tabular-nums">
          {done.filter((n) => buyGroups.some((g) => g.items.some((i) => i.name === n)))
            .length}
          /{totalBuy}
        </span>
        <span className="h-px flex-1 bg-line" />
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 text-[11px] text-ink-3"
        >
          <CopySimple size={13} />
          复制
        </button>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-card">
        {buyGroups.map((g, gi) => (
          <div key={g.group} className={cn(gi > 0 && "border-t border-line")}>
            <div className="bg-paper/60 px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-3">
              {g.group}
            </div>
            <ul>
              {g.items.map((it) => {
                const on = done.includes(it.name);
                return (
                  <li key={it.name}>
                    <button
                      type="button"
                      onClick={() => toggle(it.name)}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                    >
                      <span
                        className={cn(
                          "grid size-[17px] shrink-0 place-items-center rounded-[5px] border transition",
                          on ? "border-leaf bg-leaf text-white" : "border-line-2",
                        )}
                      >
                        {on && <Check size={11} weight="bold" />}
                      </span>
                      <span
                        className={cn(
                          "flex-1 text-[13px] transition",
                          on ? "text-ink-3 line-through" : "text-ink",
                        )}
                      >
                        {it.name}
                      </span>
                      {it.from.length > 1 && (
                        <span className="shrink-0 rounded-full bg-paper-2 px-1.5 text-[9.5px] text-ink-3 tabular-nums">
                          {it.from.length} 道
                        </span>
                      )}
                      <span
                        className={cn(
                          "shrink-0 text-[11.5px] tabular-nums",
                          on ? "text-line-2" : "text-ink-2",
                        )}
                      >
                        {it.amount}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {seasoning && (
          <div className="border-t border-line">
            <button
              type="button"
              onClick={() => setShowSeasoning((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5"
            >
              <span className="text-[11.5px] text-ink-2">
                调料 · {seasoning.items.length} 样（家里一般有）
              </span>
              <span className="text-[11px] text-ink-3">
                {showSeasoning ? "收起" : "展开"}
              </span>
            </button>
            {showSeasoning && (
              <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                {seasoning.items.map((it) => (
                  <span
                    key={it.name}
                    className="rounded-full border border-line bg-paper px-2 py-1 text-[11px] text-ink-2"
                  >
                    {it.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
