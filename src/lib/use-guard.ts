"use client";

import { useCallback, useRef } from "react";

/**
 * 前沿节流：首次点击立即执行，`wait` 毫秒内的重复点击直接丢弃。
 * 挡住手机上的连点 / 幽灵点击，避免重复加菜、重复下单、toast 刷屏。
 */
export function useGuard<A extends unknown[]>(fn: (...args: A) => void, wait = 600) {
  const last = useRef(0);
  return useCallback(
    (...args: A) => {
      const now = Date.now();
      if (now - last.current < wait) return;
      last.current = now;
      fn(...args);
    },
    [fn, wait],
  );
}
