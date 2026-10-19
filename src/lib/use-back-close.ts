"use client";

import { useEffect, useRef } from "react";

// ── 系统返回手势 / 浏览器后退：只关闭最上层的弹层 ──────────────────────────
// 弹层打开时往历史栈里压一条同地址记录，后退（popstate）就弹出最上层；
// 弹层是被界面关掉的，再把那条记录退回去，栈始终是平衡的。
type Layer = { back: () => void };
const layers: Layer[] = [];
let skipPop = 0;
let listening = false;

function onPopState() {
  if (skipPop > 0) {
    skipPop--;
    return;
  }
  const top = layers.pop();
  if (!top) return;
  top.back();
  // back() 可能只是弹了个「放弃修改？」确认而没真关；先补回记录，真关了会由 cleanup 退掉
  window.history.pushState(null, "", window.location.href);
  layers.push(top);
}

/**
 * open 为 true 期间，让系统返回手势 / 后退键触发 onBack（通常是关闭本弹层）。
 * onBack 里若弹了确认而没有真正关闭也没关系，弹层仍然在栈顶。
 */
export function useBackClose(open: boolean, onBack: () => void) {
  const ref = useRef(onBack);
  useEffect(() => {
    ref.current = onBack;
  });

  useEffect(() => {
    if (!open) return;
    if (!listening) {
      window.addEventListener("popstate", onPopState);
      listening = true;
    }
    const layer: Layer = { back: () => ref.current() };
    window.history.pushState(null, "", window.location.href);
    layers.push(layer);
    return () => {
      const i = layers.indexOf(layer);
      if (i < 0) return;
      layers.splice(i, 1);
      skipPop++;
      window.history.back();
    };
  }, [open]);
}
