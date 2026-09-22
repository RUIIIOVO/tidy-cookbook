import READY from "@/data/images.generated.json";

const withImage = new Set<string>(READY as string[]);

/** 该菜是否已有配图；没有的用分类图标占位 */
export function hasImage(dishId: string) {
  return withImage.has(dishId);
}
