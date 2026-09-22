import { CATEGORIES, RAW, SUB_TO_CATEGORY, type Raw } from "./raw";
import PINYIN from "./pinyin.generated.json";
import type { Category, CategoryId, Dish, IngredientGroup, SubId } from "./types";

const GROUP_LABEL = { 主: "主料", 辅: "辅料", 调: "调料" } as const;

function parseIngredients(s: string): IngredientGroup[] {
  return s
    .split("@")
    .map((block) => {
      const [key, rest] = block.split("|");
      const group = GROUP_LABEL[key.trim() as keyof typeof GROUP_LABEL] ?? "辅料";
      const items = (rest ?? "")
        .split(";")
        .map((x) => x.trim())
        .filter((x) => x && x !== "无")
        .map((x) => {
          const i = x.lastIndexOf(" ");
          return i === -1
            ? { name: x, amount: "" }
            : { name: x.slice(0, i), amount: x.slice(i + 1) };
        });
      return { group, items };
    })
    .filter((g) => g.items.length > 0);
}

function build(r: Raw): Dish {
  const [name, desc, sub, spicy, minutes, difficulty, tags, ing, steps] = r;
  const py = (PINYIN as Record<string, { id: string; pinyin: string; initials: string }>)[name];
  if (!py) throw new Error(`缺少拼音数据: ${name}，请重跑 node scripts/build-pinyin.mjs`);
  return {
    id: py.id,
    name,
    desc,
    category: SUB_TO_CATEGORY[sub],
    sub,
    spicy,
    minutes,
    difficulty,
    tags,
    ingredients: parseIngredients(ing),
    steps: steps.split("@").map((s) => s.trim()).filter(Boolean),
    pinyin: py.pinyin,
    initials: py.initials,
    image: `/images/dishes/${py.id}.webp`,
  };
}

export const dishes: Dish[] = RAW.map(build);

export const categories: Category[] = CATEGORIES as Category[];

export const dishById = new Map(dishes.map((d) => [d.id, d]));

export function getDish(id: string): Dish | undefined {
  return dishById.get(id);
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
