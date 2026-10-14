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
  { key: "history", href: "/history/", label: "历史", Icon: tabIcon.history },
];

export function TabBar() {
  const activeTab = useTabs((s) => s.activeTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const count = useCart((s) => s.items.reduce((n, i) => n + i.qty, 0));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[520px] border-t border-line bg-paper/85 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
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
                {active && (
                  <motion.span
                    layoutId="tab-pill"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    className="absolute inset-x-3 inset-y-1.5 -z-10 rounded-xl bg-accent-soft"
                  />
                )}
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
    </nav>
  );
}
