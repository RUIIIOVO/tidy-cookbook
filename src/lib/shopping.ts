import { dishById } from "@/data/dishes";
import type { Dish, IngredientGroup } from "@/data/types";
import type { BoughtMark, Meal } from "./protocol";

export type ShopItem = {
  name: string;
  amount: string;
  from: string[];
};

/** 待吃订单的买菜清单项：多带一个「这个食材出现在哪些订单」 */
export type MealShopItem = ShopItem & { mealIds: string[] };

const GROUP_ORDER: IngredientGroup["group"][] = ["主料", "辅料", "调料"];

/** "300g" → [300, "g"]；"适量" → null */
function parseAmount(raw: string): [number, string] | null {
  const m = raw.match(/^([\d.]+)\s*(.*)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? [n, m[2].trim()] : null;
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/**
 * 把点菜单里所有菜的食材合并成一张买菜清单。
 * 同名同单位的累加（按份数倍乘），单位不一致或「适量」这类就并排列出。
 */
export function buildShoppingList(
  rows: { dish: Dish; qty: number }[],
): { group: IngredientGroup["group"]; items: ShopItem[] }[] {
  return build(rows.map((r) => ({ ...r, mealId: "" })));
}

/**
 * 把所有待吃订单的食材合并成一张买菜清单（订单类的 buildShoppingList）。
 * 食材名取自 dishes.ts 的 parseIngredients，与 worker/kitchen-do.ts 的 DISH_INGREDIENTS 同一规则，
 * 所以这里的 (mealId, name) 与服务端 shopping_done 的键一致。
 */
export function buildMealShoppingList(
  meals: Meal[],
): { group: IngredientGroup["group"]; items: MealShopItem[] }[] {
  const rows: { dish: Dish; qty: number; mealId: string }[] = [];
  for (const m of meals) {
    for (const it of m.items) {
      const dish = dishById.get(it.dishId);
      if (dish) rows.push({ dish, qty: it.qty, mealId: m.id });
    }
  }
  return build(rows);
}

/** 一项食材涉及的所有订单都已勾选才算买好 */
export function isBought(item: { name: string; mealIds: string[] }, bought: BoughtMark[]): boolean {
  if (item.mealIds.length === 0) return false;
  const done = new Set(bought.filter((b) => b.name === item.name).map((b) => b.mealId));
  return item.mealIds.every((id) => done.has(id));
}

function build(
  rows: { dish: Dish; qty: number; mealId: string }[],
): { group: IngredientGroup["group"]; items: MealShopItem[] }[] {
  const acc = new Map<
    string,
    {
      group: IngredientGroup["group"];
      name: string;
      nums: Map<string, number>;
      texts: Set<string>;
      from: Set<string>;
      mealIds: Set<string>;
    }
  >();

  for (const { dish, qty, mealId } of rows) {
    for (const g of dish.ingredients) {
      for (const it of g.items) {
        const key = it.name;
        let e = acc.get(key);
        if (!e) {
          e = {
            group: g.group,
            name: it.name,
            nums: new Map(),
            texts: new Set(),
            from: new Set(),
            mealIds: new Set(),
          };
          acc.set(key, e);
        }
        // 主料优先级最高，遇到就提升分组
        if (GROUP_ORDER.indexOf(g.group) < GROUP_ORDER.indexOf(e.group)) e.group = g.group;
        e.from.add(dish.name);
        if (mealId) e.mealIds.add(mealId);

        const p = parseAmount(it.amount);
        if (p) e.nums.set(p[1], (e.nums.get(p[1]) ?? 0) + p[0] * qty);
        else if (it.amount) e.texts.add(it.amount);
      }
    }
  }

  const out = GROUP_ORDER.map((group) => ({ group, items: [] as MealShopItem[] }));

  for (const e of acc.values()) {
    const parts = [...e.nums.entries()].map(([unit, n]) => `${fmt(n)}${unit}`);
    if (parts.length === 0) parts.push(...e.texts);
    out
      .find((o) => o.group === e.group)!
      .items.push({
        name: e.name,
        amount: parts.join(" + "),
        from: [...e.from],
        mealIds: [...e.mealIds],
      });
  }

  for (const o of out) o.items.sort((a, b) => b.from.length - a.from.length);
  return out.filter((o) => o.items.length > 0);
}
