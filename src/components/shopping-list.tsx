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
import { GroupCard, GroupRow, GroupSection } from "./grouped-list";

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

/** 分割线缩进：行内左边距 14 + 勾选圈 20 + 间距 10 */
const ROW_INSET = 44;

/**
 * 买菜清单：只汇总传进来的订单（备菜页已按日期筛好），勾选状态实时同步给所有人。
 * 样式是 iOS 分组列表：组标题在卡片外，卡片内一行一样食材。
 * 顺序固定，勾选只改勾选圈和删除线，行高、位置都不变；「用于 N 道」点开看来源；调料默认收起。
 */
export function ShoppingList({ meals }: { meals: Meal[] }) {
  // 所有订单加起来只有一道菜时，记下它（行内就不再逐行写菜名）
  const dishIds = new Set(meals.flatMap((m) => m.items.map((i) => i.dishId)));
  const singleDish = dishIds.size === 1 ? [...dishIds][0] : null;
  const today = useCart((s) => s.today);
  const online = useSyncStatus() === "online";
  const { groups, buyGroups, seasoning, total, bought } = useShoppingData(meals);
  const [showSeasoning, setShowSeasoning] = useState(false);
  const [openName, setOpenName] = useState<string | null>(null);

  const copy = useGuard(async () => {
    const text = groups
      .map((g) => `【${g.group}】\n` + g.items.map((i) => `${i.name} ${i.amount}`).join("\n"))
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("已复制清单");
    } catch {
      toast("复制失败，请长按手动选择");
    }
  }, 1000);

  // 本地即时态：点下去立刻按目标值显示，直到服务端确认后再交还给 store。
  // 否则 store 在等待期间收到一份旧快照，勾选圈会「勾上 → 弹回 → 又勾上」来回闪。
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const toggle = (item: MealShopItem, on: boolean) => {
    if (!online) {
      toast("离线中，联网后才能勾选");
      return;
    }
    haptic(6);
    const name = item.name;
    const next = !on;
    setPending((p) => ({ ...p, [name]: next }));
    const release = () =>
      setPending((p) => {
        if (!(name in p)) return p;
        const { [name]: _drop, ...rest } = p;
        void _drop;
        return rest;
      });
    void buy(item.mealIds, name, next).then((ack) => {
      // 成功后留一小会儿，等对应的新快照落地；失败 buy() 已回滚，立刻交还
      if (ack.ok) setTimeout(release, 800);
      else release();
    });
  };
  const checked = (it: MealShopItem) => pending[it.name] ?? isBought(it, bought);

  if (groups.length === 0) {
    return <p className="py-14 text-center text-[13px] text-ink-3">这几餐没有要买的食材</p>;
  }

  // 进度也按即时态算，勾选时进度条和勾选圈同步动
  const done = buyGroups.reduce((n, g) => n + g.items.filter(checked).length, 0);
  const allDone = total > 0 && done >= total;

  return (
    <div>
      {/* 进度 */}
      {total > 0 && (
        <div className="mb-4 px-1">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="flex h-5 items-center gap-1.5 text-[12.5px] text-ink-2">
              {allDone ? (
                <>
                  <Check size={14} weight="bold" className="text-accent" />
                  <span className="font-display tracking-wider text-accent">都买齐了</span>
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
              className="-mr-1 flex items-center gap-1 px-1 py-0.5 text-[12px] text-ink-3 transition active:opacity-60"
            >
              <CopySimple size={14} />
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
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
          {!online && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-chili">
              <WifiSlash size={12} />
              离线中，联网后才能勾选
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {buyGroups.map((g) => {
          // 顺序固定（用得多的在前），勾选不改变位置
          const ordered = g.items;
          const had = ordered.filter(checked);
          return (
            <GroupSection
              key={g.group}
              title={g.group}
              aside={
                <span className="tabular-nums">
                  {had.length}/{g.items.length}
                </span>
              }
            >
              <GroupCard>
                {ordered.map((it, idx) => (
                  <ShopRow
                    key={it.name}
                    item={it}
                    last={idx === ordered.length - 1}
                    on={checked(it)}
                    open={openName === it.name}
                    onToggle={toggle}
                    onOpen={() => setOpenName((v) => (v === it.name ? null : it.name))}
                    meals={meals}
                    today={today}
                    showSource={singleDish === null}
                  />
                ))}
              </GroupCard>
            </GroupSection>
          );
        })}

        {seasoning && (
          <GroupSection>
            <GroupCard>
              <GroupRow last inset={0}>
                <button
                  type="button"
                  aria-expanded={showSeasoning}
                  onClick={() => setShowSeasoning((v) => !v)}
                  className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition active:bg-paper"
                >
                  <span className="min-w-0 text-[14px] leading-snug text-ink">
                    调料 · <span className="tabular-nums">{seasoning.items.length}</span> 样
                    <span className="ml-2 text-[11.5px] text-ink-3">先看看家里有没有</span>
                  </span>
                  <CaretDown
                    size={13}
                    className={cn("shrink-0 text-ink-3 transition-transform", showSeasoning && "rotate-180")}
                  />
                </button>
                {showSeasoning && (
                  <div className="flex flex-wrap gap-1.5 px-3.5 pb-3.5">
                    {seasoning.items.map((it) => (
                      <span
                        key={it.name}
                        className="rounded-full bg-paper-2 px-2.5 py-1 text-[11.5px] text-ink-2"
                      >
                        {it.name}
                      </span>
                    ))}
                  </div>
                )}
              </GroupRow>
            </GroupCard>
          </GroupSection>
        )}
      </div>
    </div>
  );
}

function ShopRow({
  item,
  last,
  on,
  open,
  onToggle,
  onOpen,
  meals,
  today,
  showSource,
}: {
  item: MealShopItem;
  last: boolean;
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
    <GroupRow last={last} inset={ROW_INSET}>
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
        className="flex min-h-12 w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left transition active:bg-paper"
      >
        <span
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition",
            on ? "border-accent bg-accent text-white" : "border-line-2",
          )}
        >
          {on && <Check size={11} weight="bold" />}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[14.5px] transition",
            on ? "text-ink-3 line-through" : "text-ink",
          )}
        >
          {item.name}
        </span>
        {item.from.length === 1 ? (
          // 只用在一道菜：直接写菜名，不必点开
          showSource && (
            <span className="max-w-[40%] shrink-0 truncate text-[11px] text-ink-3">{item.from[0]}</span>
          )
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
            className="flex shrink-0 items-center gap-0.5 rounded-full bg-paper-2 px-2 py-0.5 text-[10.5px] text-ink-3 transition active:scale-95"
          >
            用于 <span className="tabular-nums">{item.from.length}</span> 道
            <CaretDown size={9} className={cn("transition-transform", open && "rotate-180")} />
          </button>
        )}
        <span className={cn("shrink-0 text-[12px] tabular-nums", on ? "text-line-2" : "text-ink-2")}>
          {item.amount}
        </span>
      </div>
      {open && (
        <ul
          className="mr-3.5 mb-3 space-y-1.5 rounded-lg bg-paper px-3 py-2 text-[12px]"
          style={{ marginLeft: ROW_INSET }}
        >
          {sources.map((s) => (
            <li key={s.key} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-ink-2">{s.dish}</span>
              <span className="shrink-0 text-[11px] text-ink-3">{s.when}</span>
            </li>
          ))}
        </ul>
      )}
    </GroupRow>
  );
}
