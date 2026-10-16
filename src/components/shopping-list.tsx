"use client";

import { useMemo, useState } from "react";
import { CaretDown, Check, CopySimple, WifiSlash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { dishById } from "@/data/dishes";
import { buy } from "@/lib/meal-actions";
import { mealTitle } from "@/lib/meal-time";
import type { Meal } from "@/lib/protocol";
import { buildMealShoppingList, isBought, type MealShopItem } from "@/lib/shopping";
import { useCart } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { useGuard } from "@/lib/use-guard";
import { cn, haptic } from "@/lib/utils";

/**
 * 买菜清单的数据：主料 / 辅料算「要买」，调料只提醒，不计进度。
 * 备菜页的概要、分段标签和清单本身共用这一份算法。
 */
export function useShoppingData(meals: Meal[]) {
  const bought = useCart((s) => s.bought);
  const groups = useMemo(() => buildMealShoppingList(meals), [meals]);
  return useMemo(() => {
    const buyGroups = groups.filter((g) => g.group !== "调料");
    const seasoning = groups.find((g) => g.group === "调料");
    const total = buyGroups.reduce((n, g) => n + g.items.length, 0);
    const done = buyGroups.reduce(
      (n, g) => n + g.items.filter((i) => isBought(i, bought)).length,
      0,
    );
    return { groups, buyGroups, seasoning, total, done, bought };
  }, [groups, bought]);
}

/** 一项食材用在哪几道菜、哪一餐 */
function sourcesOf(item: MealShopItem, meals: Meal[], today: string) {
  const ids = new Set(item.mealIds);
  const out: { key: string; dish: string; when: string }[] = [];
  for (const m of meals) {
    if (!ids.has(m.id)) continue;
    for (const it of m.items) {
      const dish = dishById.get(it.dishId);
      if (!dish) continue;
      if (!dish.ingredients.some((g) => g.items.some((x) => x.name === item.name))) continue;
      out.push({
        key: `${m.id}:${dish.id}`,
        dish: dish.name,
        when: mealTitle(m.mealDate, m.slot, today),
      });
    }
  }
  return out;
}

/**
 * 买菜清单：只汇总传进来的订单（备菜页已按日期筛好），勾选状态实时同步给所有人。
 * 勾过的沉到组底；「用于 N 道」点开看来源；调料默认收起。
 */
export function ShoppingList({ meals }: { meals: Meal[] }) {
  // 所有订单加起来只有一道菜时，记下它（行内就不再逐行写菜名）
  const dishIds = new Set(meals.flatMap((m) => m.items.map((i) => i.dishId)));
  const singleDish = dishIds.size === 1 ? [...dishIds][0] : null;
  const today = useCart((s) => s.today);
  const online = useSyncStatus() === "online";
  const { groups, buyGroups, seasoning, total, done, bought } = useShoppingData(meals);
  const [showSeasoning, setShowSeasoning] = useState(false);
  const [openName, setOpenName] = useState<string | null>(null);

  const copy = useGuard(async () => {
    const text = groups
      .map((g) => `【${g.group}】\n` + g.items.map((i) => `${i.name} ${i.amount}`).join("\n"))
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("清单复制好了");
    } catch {
      toast("复制没成功，手动长按选中吧");
    }
  }, 1000);

  const toggle = (item: MealShopItem, on: boolean) => {
    if (!online) {
      toast("离线中，联网后才能勾选");
      return;
    }
    haptic(6);
    void buy(item.mealIds, item.name, !on);
  };

  if (groups.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line-2 py-10 text-center text-[12px] text-ink-3">
        这几餐没有要买的食材
      </p>
    );
  }

  const allDone = total > 0 && done >= total;

  return (
    <section>
      {/* 进度 */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[12px] text-ink-2">
            {allDone ? (
              <>
                <Check size={13} weight="bold" className="text-leaf" />
                <span className="font-display tracking-wider text-leaf">都买齐了</span>
              </>
            ) : (
              <>
                已买 <span className="tabular-nums text-ink">{done}</span> /{" "}
                <span className="tabular-nums">{total}</span>
              </>
            )}
          </p>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1 text-[11px] text-ink-3 transition active:opacity-60"
          >
            <CopySimple size={13} />
            复制
          </button>
        </div>
        <div
          role="progressbar"
          aria-label="买菜进度"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="h-1 overflow-hidden rounded-full bg-paper-2"
        >
          <div
            className="h-full rounded-full bg-leaf transition-[width] duration-300"
            style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
          />
        </div>
        {!online && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-chili">
            <WifiSlash size={12} />
            离线中，联网后才能勾选
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-card">
        {buyGroups.map((g, gi) => {
          // 没买的在前，勾过的沉到组底（组内原有顺序不变）
          const todo = g.items.filter((i) => !isBought(i, bought));
          const had = g.items.filter((i) => isBought(i, bought));
          return (
            <div key={g.group} className={cn(gi > 0 && "border-t border-line")}>
              <div className="bg-paper/60 px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-3">
                {g.group}
              </div>
              <ul>
                {[...todo, ...had].map((it) => (
                  <ShopRow
                    key={it.name}
                    item={it}
                    on={isBought(it, bought)}
                    open={openName === it.name}
                    onToggle={toggle}
                    onOpen={() => setOpenName((v) => (v === it.name ? null : it.name))}
                    meals={meals}
                    today={today}
                    showSource={singleDish === null}
                  />
                ))}
              </ul>
            </div>
          );
        })}

        {seasoning && (
          <div className={cn(buyGroups.length > 0 && "border-t border-line")}>
            <button
              type="button"
              aria-expanded={showSeasoning}
              onClick={() => setShowSeasoning((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
            >
              <span className="text-[11.5px] leading-snug text-ink-2">
                调料 · {seasoning.items.length} 样，出门前看一眼家里还有没有
              </span>
              <CaretDown
                size={12}
                className={cn("shrink-0 text-ink-3 transition-transform", showSeasoning && "rotate-180")}
              />
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

function ShopRow({
  item,
  on,
  open,
  onToggle,
  onOpen,
  meals,
  today,
  showSource,
}: {
  item: MealShopItem;
  on: boolean;
  open: boolean;
  onToggle: (item: MealShopItem, on: boolean) => void;
  onOpen: () => void;
  meals: Meal[];
  today: string;
  /** 清单只来自一道菜时不必每行重复写菜名 */
  showSource: boolean;
}) {
  // 展开时才算来源
  const sources = open ? sourcesOf(item, meals, today) : [];

  return (
    <li>
      {/* 整行是勾选；「用于 N 道」是行里的小按钮，所以行本身用 div role="button" */}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={on}
        onClick={() => onToggle(item, on)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(item, on);
          }
        }}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left transition active:bg-paper"
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
            "min-w-0 flex-1 truncate text-[13px] transition",
            on ? "text-ink-3 line-through" : "text-ink",
          )}
        >
          {item.name}
        </span>
        {item.from.length === 1 ? (
          showSource &&
          // 只用在一道菜：直接写菜名，不必点开
          <span className="max-w-[40%] shrink-0 truncate text-[10.5px] text-ink-3">{item.from[0]}</span>
        ) : (
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${item.name}用在哪几道菜`}
          onClick={(e) => {
            e.stopPropagation();
            haptic(6);
            onOpen();
          }}
          className="flex shrink-0 items-center gap-0.5 rounded-full bg-paper-2 px-2 py-0.5 text-[10px] text-ink-3 transition active:scale-95"
        >
          用于 <span className="tabular-nums">{item.from.length}</span> 道
          <CaretDown size={9} className={cn("transition-transform", open && "rotate-180")} />
        </button>
        )}
        <span
          className={cn(
            "shrink-0 text-[11.5px] tabular-nums",
            on ? "text-line-2" : "text-ink-2",
          )}
        >
          {item.amount}
        </span>
      </div>
      {open && (
        <ul className="mx-3 mb-2.5 space-y-1 border-l border-dashed border-line-2 pl-3 text-[11.5px]">
          {sources.map((s) => (
            <li key={s.key} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-display text-ink-2">{s.dish}</span>
              <span className="shrink-0 text-[10.5px] text-ink-3">{s.when}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
