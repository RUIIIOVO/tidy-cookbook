import type { Dish } from "@/data/types";

/**
 * 轻量打分匹配：菜名 > 首字母 > 全拼 > 标签 > 描述 > 食材
 * 不依赖 pinyin-pro 运行时字典（拼音已在构建期生成）。
 */
export function searchDishes(dishes: Dish[], raw: string): Dish[] {
  const q = raw.trim().toLowerCase();
  if (!q) return dishes;

  const scored: { d: Dish; s: number }[] = [];

  for (const d of dishes) {
    let s = 0;
    if (d.name === raw.trim()) s = 1000;
    else if (d.name.startsWith(raw.trim())) s = 900;
    else if (d.name.includes(raw.trim())) s = 800;
    else if (d.initials === q) s = 760;
    else if (d.initials.startsWith(q)) s = 700;
    else if (d.pinyin.startsWith(q)) s = 680;
    else if (d.initials.includes(q)) s = 520;
    else if (d.pinyin.includes(q)) s = 500;
    else if (d.tags.some((t) => t.includes(raw.trim()))) s = 400;
    else if (d.desc.includes(raw.trim())) s = 300;
    else if (
      d.ingredients.some((g) => g.items.some((i) => i.name.includes(raw.trim())))
    )
      s = 200;

    if (s > 0) scored.push({ d, s });
  }

  return scored.sort((a, b) => b.s - a.s || a.d.name.localeCompare(b.d.name)).map((x) => x.d);
}
