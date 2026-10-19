import { CATEGORIES, RAW, SUB_TO_CATEGORY, type Raw } from "./raw";
import PINYIN from "./pinyin.generated.json";
import LEGACY_IDS from "./legacy-ids.json";
import { parseIngredients } from "./ingredients";
import type { Category, CategoryId, Dish, SubId } from "./types";

function build(r: Raw): Dish {
  const [num, name, desc, sub, spicy, tags, ing, steps] = r;
  const id = String(num);
  const py = (PINYIN as Record<string, { pinyin: string; initials: string }>)[id];
  if (!py) throw new Error(`缺少拼音数据: ${name}，请重跑 node scripts/build-pinyin.mjs`);
  return {
    id,
    name,
    desc,
    category: SUB_TO_CATEGORY[sub],
    sub,
    spicy,
    tags,
    ingredients: parseIngredients(ing),
    steps: steps.split("@").map((s) => s.trim()).filter(Boolean),
    pinyin: py.pinyin,
    initials: py.initials,
    image: `/images/dishes/${id}.webp`,
  };
}

export const dishes: Dish[] = RAW.map(build);

export const categories: Category[] = CATEGORIES as Category[];

export const dishById = new Map(dishes.map((d) => [d.id, d]));

/** 旧版拼音 slug → 数字 id。老用户本地缓存里的点菜单还存着旧 id */
const LEGACY = LEGACY_IDS as Record<string, string>;

/** 把任何历史遗留的 id 规整成当前数字 id */
export function normalizeDishId(id: string): string {
  return LEGACY[id] ?? id;
}

export function getDish(id: string): Dish | undefined {
  return dishById.get(normalizeDishId(id));
}

export const SUB_NAME: Record<SubId, string> = Object.fromEntries(
  categories.flatMap((c) => c.subs.map((s) => [s.id, s.name])),
) as Record<SubId, string>;

export const CATEGORY_NAME: Record<CategoryId, string> = Object.fromEntries(
  categories.map((c) => [c.id, c.name]),
) as Record<CategoryId, string>;

/** 按左侧导航顺序展开的分组（小类为一节） */
export const sections = categories.flatMap((c) =>
  c.subs.map((s) => ({
    key: s.id,
    category: c.id,
    categoryName: c.name,
    subName: s.name,
    dishes: dishes.filter((d) => d.sub === s.id),
  })),
);
