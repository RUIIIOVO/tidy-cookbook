"use client";

import { CaretRight } from "@phosphor-icons/react";
import { useCart } from "@/lib/store";
import { useTabs } from "@/lib/tab-store";
import { haptic } from "@/lib/utils";

/** 订单页标题下的一行提示：还有几餐没做，点一下去备菜页。没有就不画 */
export function PrepHint() {
  const n = useCart((s) => s.meals.length);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  if (n === 0) return null;

  return (
    <button
      type="button"
      onClick={() => {
        haptic(6);
        setActiveTab("prep");
      }}
      className="mt-2.5 flex items-center gap-1 text-[12px] text-accent transition active:opacity-60"
    >
      还有 <span className="tabular-nums">{n}</span> 餐没做，去备菜
      <CaretRight size={12} weight="bold" />
    </button>
  );
}
