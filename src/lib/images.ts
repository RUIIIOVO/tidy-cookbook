import READY from "@/data/images.generated.json";

const withImage = new Set<string>(READY as string[]);

/** 该菜是否已有配图；没有的用分类图标占位 */
export function hasImage(dishId: string) {
  return withImage.has(dishId);
}

/** 已下载并解码完成的图片地址；DishThumb 命中时直接显示，不再走淡入 */
const decoded = new Set<string>();
const pending = new Map<string, Promise<void>>();

export function isDecoded(src: string) {
  return decoded.has(src);
}

export function markDecoded(src: string) {
  decoded.add(src);
}

/** 预下载并解码一张图；失败也 resolve，调用方不需要处理异常 */
export function preloadImage(src: string): Promise<void> {
  if (typeof window === "undefined" || decoded.has(src)) return Promise.resolve();
  let p = pending.get(src);
  if (!p) {
    p = new Promise<void>((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      const done = () => {
        decoded.add(src);
        pending.delete(src);
        resolve();
      };
      img
        .decode()
        .then(done)
        .catch(() => {
          pending.delete(src);
          resolve();
        });
    });
    pending.set(src, p);
  }
  return p;
}
