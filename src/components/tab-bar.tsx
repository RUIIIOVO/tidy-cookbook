"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useCart } from "@/lib/store";
import { tabIcon } from "@/lib/icons";
import { TabKey, useTabs } from "@/lib/tab-store";
import { cn, haptic } from "@/lib/utils";

const TABS: { key: TabKey; href: string; label: string; Icon: (typeof tabIcon)[keyof typeof tabIcon] }[] = [
  { key: "draw", href: "/", label: "抽菜", Icon: tabIcon.draw },
  { key: "menu", href: "/menu/", label: "菜单", Icon: tabIcon.menu },
  { key: "cart", href: "/cart/", label: "点菜单", Icon: tabIcon.cart },
  { key: "prep", href: "/prep/", label: "备菜", Icon: tabIcon.prep },
  { key: "history", href: "/history/", label: "订单", Icon: tabIcon.history },
];

export function TabBar() {
  const activeTab = useTabs((s) => s.activeTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const count = useCart((s) => s.items.reduce((n, i) => n + i.qty, 0));
  const pendingMealCount = useCart((s) => s.meals.length);

  const activeIndex = Math.max(0, TABS.findIndex((t) => t.key === activeTab));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[520px] border-t border-line bg-paper/85 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="relative">
        {/* 纯水平受控滑动胶囊：脱离 layoutId 全局几何测量，永远只沿 X 轴平滑平移，杜绝一切受滚动条影响的纵向掉落 */}
        <motion.div
          initial={false}
          animate={{ x: `${activeIndex * 100}%` }}
          transition={{ type: "spring", stiffness: 480, damping: 38 }}
          className="pointer-events-none absolute inset-y-0 left-0 w-1/5 p-1.5"
        >
          <div className="h-full w-full rounded-xl bg-accent-soft" />
        </motion.div>

        <ul className="relative flex">
          {TABS.map(({ key, href, label, Icon }) => {
            const active = activeTab === key;
            return (
              <li key={key} className="flex-1">
                <Link
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    haptic(6);
                    setActiveTab(key);
                  }}
                  className="relative flex h-14 flex-col items-center justify-center gap-[3px]"
                >
                  <span className="relative">
                    <Icon
                      size={21}
                      weight={active ? "fill" : "regular"}
                      className={cn(
                        "transition-colors duration-150",
                        active ? "text-accent" : "text-ink-3",
                      )}
                    />
                    {key === "cart" && count > 0 && (
                      <span className="absolute -top-1 -right-2 min-w-[15px] rounded-full bg-accent px-1 text-center text-[10px] leading-[15px] font-medium text-white tabular-nums">
                        {count}
                      </span>
                    )}
                    {key === "prep" && pendingMealCount > 0 && (
                      <span className="absolute -top-1 -right-2 min-w-[15px] rounded-full bg-accent/70 px-1 text-center text-[10px] leading-[15px] font-medium text-white tabular-nums">
                        {pendingMealCount}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] tracking-wide transition-colors duration-150",
                      active ? "text-accent" : "text-ink-3",
                    )}
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
