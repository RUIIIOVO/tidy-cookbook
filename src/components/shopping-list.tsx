"use client";

import { useMemo, useState } from "react";
import { Basket, Check, CopySimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { buy } from "@/lib/meal-actions";
import { dayLabel, shortDate } from "@/lib/meal-time";
import type { Meal } from "@/lib/protocol";
import { buildMealShoppingList, isBought } from "@/lib/shopping";
import { useCart } from "@/lib/store";
import { cn, haptic } from "@/lib/utils";
import { useGuard } from "@/lib/use-guard";

/** 买菜清单：汇总所有待吃订单的食材，勾选状态实时同步给所有人 */
export function ShoppingList({ meals }: { meals: Meal[] }) {
  const today = useCart((s) => s.today);
  const bought = useCart((s) => s.bought);
  const [showSeasoning, setShowSeasoning] = useState(true);
  const [pickedDay, setPickedDay] = useState<string>("all");

  // 确实有订单的日期；只有一天时不需要筛选
  const days = useMemo(() => [...new Set(meals.map((m) => m.mealDate))].sort(), [meals]);
  // 选中的那天订单没了（被删 / 过了切日点），自动退回「全部」
  const day = days.includes(pickedDay) ? pickedDay : "all";
  const shown = useMemo(
    () => (day === "all" ? meals : meals.filter((m) => m.mealDate === day)),
    [meals, day],
  );

  const groups = useMemo(() => buildMealShoppingList(shown), [shown]);
  const buyGroups = groups.filter((g) => g.group !== "调料");
  const seasoning = groups.find((g) => g.group === "调料");
  const totalBuy = buyGroups.reduce((n, g) => n + g.items.length, 0);
  const doneBuy = buyGroups.reduce(
    (n, g) => n + g.items.filter((i) => isBought(i, bought)).length,
    0,
  );

  const copy = useGuard(async () => {
    const text = groups
      .map(
        (g) =>
          `【${g.group}】\n` + g.items.map((i) => `${i.name} ${i.amount}`).join("\n"),
      )
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("清单复制好了");
    } catch {
      toast("复制没成功，手动长按选中吧");
    }
  }, 1000);

  // 离线时 buy 会失败并 toast，这里不用再管
  const toggle = (item: { name: string; mealIds: string[] }, on: boolean) => {
    haptic(6);
    void buy(item.mealIds, item.name, !on);
  };

  if (groups.length === 0) return null;

  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-center gap-2">
        <Basket size={16} weight="regular" className="text-ink" />
        <h2 className="font-display text-[15px] tracking-[0.22em] text-ink">买菜清单</h2>
        <span className="text-[10px] text-ink-3 tabular-nums">
          {doneBuy}/{totalBuy}
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

      {days.length > 1 && (
        <div role="radiogroup" aria-label="按天筛选" className="no-scrollbar -mx-4 mb-2.5 flex gap-2 overflow-x-auto px-4">
          {["all", ...days].map((d) => {
            const on = d === day;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  haptic(6);
                  setPickedDay(d);
                }}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-[11.5px] transition active:scale-95",
                  on
                    ? "border-accent bg-accent font-medium text-white"
                    : "border-line bg-card text-ink-2",
                )}
              >
                {d === "all" ? "全部" : (dayLabel(d, today) ?? shortDate(d))}
              </button>
            );
          })}
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-line bg-card">
        {buyGroups.map((g, gi) => (
          <div key={g.group} className={cn(gi > 0 && "border-t border-line")}>
            <div className="bg-paper/60 px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-3">
              {g.group}
            </div>
            <ul>
              {g.items.map((it) => {
                const on = isBought(it, bought);
                return (
                  <li key={it.name}>
                    <button
                      type="button"
                      onClick={() => toggle(it, on)}
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
                      {it.mealIds.length > 1 && (
                        <span className="shrink-0 rounded-full bg-paper-2 px-1.5 text-[9.5px] text-ink-3 tabular-nums">
                          {it.mealIds.length} 餐
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
                调料 · {seasoning.items.length} 样
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
