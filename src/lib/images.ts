import READY from "@/data/images.generated.json";

const withImage = new Set<string>(READY as string[]);

/** 该菜是否已有配图；没有的用分类图标占位 */
export function hasImage(dishId: string) {
  return withImage.has(dishId);
}

/** 已下载并解码完成的图片地址；DishThumb 命中时直接显示，不再走淡入。定长 LRU 防止无界增长 */
const MAX_DECODED_CACHE = 120;
const decoded = new Set<string>();
const pending = new Map<string, Promise<void>>();

export function isDecoded(src: string) {
  return decoded.has(src);
}

export function markDecoded(src: string) {
  if (decoded.size >= MAX_DECODED_CACHE) {
    const oldest = decoded.values().next().value;
    if (oldest) decoded.delete(oldest);
  }
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
        markDecoded(src);
        pending.delete(src);
        resolve();
      };
      if (img.complete && img.naturalWidth > 0) {
        done();
        return;
      }
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

/** 空闲预热队列控制 */
let activeQueue: string[] = [];
let scheduledHandle: number | null = null;
let scheduledTimer: ReturnType<typeof setTimeout> | null = null;

/** 立即终止并清空当前所有未完成的空闲预热任务，把带宽彻底让给用户当前操作 */
export function cancelIdlePreload() {
  activeQueue = [];
  if (scheduledHandle !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
    (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(scheduledHandle);
    scheduledHandle = null;
  }
  if (scheduledTimer !== null) {
    clearTimeout(scheduledTimer);
    scheduledTimer = null;
  }
}

/** 靶向高优先级预热：用户点击指定分类后，优先把目标区域前几张图片快速解码并填入内存缓存 */
export function preloadPriorityImages(srcs: string[], count = 6) {
  if (typeof window === "undefined") return;
  cancelIdlePreload();
  const targets = srcs.filter((s) => !decoded.has(s)).slice(0, count);
  for (const s of targets) {
    void preloadImage(s);
  }
}

/** 空闲时分批轻量预热紧邻分类的图片，单批 2 张，避免占用主通道带宽 */
export function scheduleIdlePreload(srcs: string[], batchSize = 2) {
  if (typeof window === "undefined") return;
  cancelIdlePreload();

  activeQueue = srcs.filter((s) => !decoded.has(s));
  if (activeQueue.length === 0) return;

  const processNextBatch = () => {
    scheduledHandle = null;
    scheduledTimer = null;
    if (activeQueue.length === 0) return;

    const batch = activeQueue.splice(0, batchSize);
    void Promise.allSettled(batch.map((s) => preloadImage(s))).then(() => {
      if (activeQueue.length > 0) {
        if ("requestIdleCallback" in window) {
          scheduledHandle = window.requestIdleCallback(() => processNextBatch(), { timeout: 2000 });
        } else {
          scheduledTimer = setTimeout(processNextBatch, 300);
        }
      }
    });
  };

  if ("requestIdleCallback" in window) {
    scheduledHandle = window.requestIdleCallback(() => processNextBatch(), { timeout: 2000 });
  } else {
    scheduledTimer = setTimeout(processNextBatch, 500);
  }
}
