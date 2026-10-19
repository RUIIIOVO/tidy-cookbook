/**
 * 食材编码解析：`主|名 用量;名 用量@辅|...@调|...`。
 * 前端（dishes.ts）和 Worker（买菜勾选校验）共用这一份，别再各写各的。
 * 只依赖类型，不引入拼音等前端数据，Worker 打包不会变大。
 */
import type { IngredientGroup } from "./types";

const GROUP_LABEL = { 主: "主料", 辅: "辅料", 调: "调料" } as const;

export function parseIngredients(s: string): IngredientGroup[] {
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

/** 一道菜用到的全部食材名（买菜清单按名字合并） */
export function ingredientNames(s: string): string[] {
  return parseIngredients(s).flatMap((g) => g.items.map((i) => i.name));
}
