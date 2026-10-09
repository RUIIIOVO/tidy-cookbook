"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useCustomModal } from "@/lib/custom-modal-store";
import { useDishSheet } from "@/lib/ui-store";

/**
 * 菜品详情抽屉 / 定制抽屉的按需加载挂载点。
 *
 * 首屏不下载 vaul 和抽屉代码：用户第一次打开时才拉取，之后一直挂着（保证关闭动画完整）。
 * 页面空闲时也会顺手预取，多数情况下点击时代码已经在缓存里。
 */
const DishSheetImpl = dynamic(
  () => import("./dish-sheet").then((m) => m.DishSheet),
  {
    ssr: false,
  },
);
const CustomDrawerImpl = dynamic(
  () => import("./custom-option-drawer").then((m) => m.CustomOptionDrawer),
  { ssr: false },
);

/** 空闲时预取抽屉代码；只预取不挂载，不占首屏带宽 */
let prefetched = false;
function prefetchSheets() {
  if (prefetched || typeof window === "undefined") return;
  prefetched = true;
  const run = () => {
    void import("./dish-sheet");
    void import("./custom-option-drawer");
  };
  const ric = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (ric) ric(run, { timeout: 4000 });
  else setTimeout(run, 2500);
}

export function DishSheet() {
  const wanted = useDishSheet((s) => s.dishId !== null);
  // 第一次打开后一直挂着，关闭时让退场动画跑完（在渲染期派生，不走 effect）
  const [mounted, setMounted] = useState(false);
  if (wanted && !mounted) setMounted(true);
  useEffect(prefetchSheets, []);
  return mounted ? <DishSheetImpl /> : null;
}

export function CustomOptionDrawer() {
  const wanted = useCustomModal((s) => s.dishId !== null);
  // 第一次打开后一直挂着，关闭时让退场动画跑完（在渲染期派生，不走 effect）
  const [mounted, setMounted] = useState(false);
  if (wanted && !mounted) setMounted(true);
  useEffect(prefetchSheets, []);
  return mounted ? <CustomDrawerImpl /> : null;
}
