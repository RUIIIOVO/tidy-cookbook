import type { Dish, IngredientGroup } from "@/data/types";

export type ShopItem = {
  name: string;
  amount: string;
  from: string[];
};

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
  const acc = new Map<
    string,
    {
      group: IngredientGroup["group"];
      name: string;
      nums: Map<string, number>;
      texts: Set<string>;
      from: Set<string>;
    }
  >();

  for (const { dish, qty } of rows) {
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
          };
          acc.set(key, e);
        }
        // 主料优先级最高，遇到就提升分组
        if (GROUP_ORDER.indexOf(g.group) < GROUP_ORDER.indexOf(e.group)) e.group = g.group;
        e.from.add(dish.name);

        const p = parseAmount(it.amount);
        if (p) e.nums.set(p[1], (e.nums.get(p[1]) ?? 0) + p[0] * qty);
        else if (it.amount) e.texts.add(it.amount);
      }
    }
  }

  const out = GROUP_ORDER.map((group) => ({ group, items: [] as ShopItem[] }));

  for (const e of acc.values()) {
    const parts = [...e.nums.entries()].map(([unit, n]) => `${fmt(n)}${unit}`);
    if (parts.length === 0) parts.push(...e.texts);
    out
      .find((o) => o.group === e.group)!
      .items.push({ name: e.name, amount: parts.join(" + "), from: [...e.from] });
  }

  for (const o of out) o.items.sort((a, b) => b.from.length - a.from.length);
  return out.filter((o) => o.items.length > 0);
}
