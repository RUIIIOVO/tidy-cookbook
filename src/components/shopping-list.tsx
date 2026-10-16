"use client";

import { useMemo, useState } from "react";
import { Check, CopySimple, Minus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { buy } from "@/lib/meal-actions";
import type { Meal } from "@/lib/protocol";
import { buildMealShoppingList, isBought, type MealShopItem } from "@/lib/shopping";
import { useCart } from "@/lib/store";
import { useGuard } from "@/lib/use-guard";
import { cn, haptic } from "@/lib/utils";
import { GroupCard, GroupRow } from "./grouped-list";

/**
 * 买菜清单的数据：主料 / 辅料 / 调料一视同仁，都能勾选、都计进度。
 * 备菜页的概要、分段标签和清单本身共用这一份算法。
 */
export function useShoppingData(meals: Meal[]) {
  const bought = useCart((s) => s.bought);
  const groups = useMemo(() => buildMealShoppingList(meals), [meals]);
  return useMemo(() => {
    const buyGroups = groups;
    const total = buyGroups.reduce((n, g) => n + g.items.length, 0);
    const done = buyGroups.reduce(
      (n, g) => n + g.items.filter((i) => isBought(i, bought)).length,
      0,
    );
    return { groups, buyGroups, total, done, bought };
  }, [groups, bought]);
}

/** 分割线缩进：行内左边距 14 + 勾选圈 20 + 间距 10 */
const ROW_INSET = 44;

/**
 * 买菜清单：只汇总传进来的订单（备菜页已按日期筛好），勾选状态实时同步给所有人。
 * 样式是 iOS 分组列表：组标题在卡片外，卡片内一行一样食材。
 * 顺序固定，勾选只改勾选圈和删除线，行高、位置都不变；「用于 N 道」点开看来源；调料默认展开。
 */
export function ShoppingList({ meals }: { meals: Meal[] }) {
  // 所有订单加起来只有一道菜时，记下它（行内就不再逐行写菜名）
  const dishIds = new Set(meals.flatMap((m) => m.items.map((i) => i.dishId)));
  const singleDish = dishIds.size === 1 ? [...dishIds][0] : null;
  const { groups, buyGroups, total, bought } = useShoppingData(meals);

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

  const setItem = (item: MealShopItem, next: boolean) => {
    const name = item.name;
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
  const toggle = (item: MealShopItem, on: boolean) => {
    haptic(6);
    setItem(item, !on);
  };
  // 整组：没全勾就全勾上，已经全勾了就全取消
  const toggleGroup = (items: MealShopItem[]) => {
    haptic(8);
    const allOn = items.every(checked);
    for (const it of items) if (checked(it) === allOn) setItem(it, !allOn);
  };
  function checked(it: MealShopItem) {
    return pending[it.name] ?? isBought(it, bought);
  }

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
        </div>
      )}

      <div className="flex flex-col gap-5">
        {buyGroups.map((g) => {
          // 顺序固定（用得多的在前），勾选不改变位置
          const ordered = g.items;
          const had = ordered.filter(checked);
          return (
            <section key={g.group}>
              <GroupHeader
                title={g.group}
                done={had.length}
                total={g.items.length}
                onToggle={() => toggleGroup(g.items)}
              />
              <GroupCard>
                {ordered.map((it, idx) => (
                  <ShopRow
                    key={it.name}
                    item={it}
                    last={idx === ordered.length - 1}
                    on={checked(it)}
                    onToggle={toggle}
                    showSource={singleDish === null}
                  />
                ))}
              </GroupCard>
            </section>
          );
        })}

      </div>
    </div>
  );
}

function ShopRow({
  item,
  last,
  on,
  onToggle,
  showSource,
}: {
  item: MealShopItem;
  last: boolean;
  on: boolean;
  onToggle: (item: MealShopItem, on: boolean) => void;
  /** 清单只来自一道菜时不必每行重复写菜名 */
  showSource: boolean;
}) {
  // 食材下面一行小字写用在哪几道菜（参考 iOS 提醒事项的副标题），不用点开
  const source =
    item.from.length > 2
      ? `${item.from.slice(0, 2).join("、")} 等 ${item.from.length} 道`
      : item.from.join("、");

  return (
    <GroupRow last={last} inset={ROW_INSET}>
      {/* 整行就是勾选，行内没有别的可点元素 */}
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onToggle(item, on)}
        className="flex min-h-12 w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition active:bg-paper"
      >
        <span
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition",
            on ? "border-accent bg-accent text-white" : "border-line-2",
          )}
        >
          {on && <Check size={11} weight="bold" />}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[14.5px] leading-snug transition",
              on ? "text-ink-3 line-through" : "text-ink",
            )}
          >
            {item.name}
          </span>
          {showSource && source && (
            <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-ink-3">{source}</span>
          )}
        </span>
        <span className={cn("shrink-0 text-[12px] tabular-nums", on ? "text-line-2" : "text-ink-2")}>
          {item.amount}
        </span>
      </button>
    </GroupRow>
  );
}

/**
 * 组标题条（主料 / 辅料 / 调料）：整条都能点，前面是三态勾选框。
 * 全勾 → 实心对勾；部分勾 → 横杠；没勾 → 空圈。点一下整组全选 / 全取消。
 */
function GroupHeader({
  title,
  done,
  total,
  onToggle,
}: {
  title: string;
  done: number;
  total: number;
  onToggle: () => void;
}) {
  const all = total > 0 && done >= total;
  const some = done > 0 && !all;
  return (
    <button
      type="button"
      aria-pressed={all}
      aria-label={`${title}，已买 ${done} / ${total}，点一下${all ? "全部取消" : "全部勾选"}`}
      onClick={onToggle}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3.5 text-left transition active:bg-paper-2"
    >
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition",
          all || some ? "border-accent bg-accent text-white" : "border-line-2",
        )}
      >
        {all && <Check size={11} weight="bold" />}
        {some && <Minus size={11} weight="bold" />}
      </span>
      <span className="min-w-0 flex-1 truncate font-display text-[16px] tracking-wider text-ink">{title}</span>
      <span className="shrink-0 text-[11px] tabular-nums text-ink-3">
        {done}/{total}
      </span>
    </button>
  );
}
