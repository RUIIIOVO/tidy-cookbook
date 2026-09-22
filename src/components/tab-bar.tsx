"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useCart } from "@/lib/store";
import { tabIcon } from "@/lib/icons";
import { cn, haptic } from "@/lib/utils";

const TABS = [
  { href: "/", label: "抽菜", Icon: tabIcon.draw },
  { href: "/menu", label: "菜单", Icon: tabIcon.menu },
  { href: "/cart", label: "点菜单", Icon: tabIcon.cart },
  { href: "/history", label: "历史", Icon: tabIcon.history },
];

export function TabBar() {
  const pathname = usePathname();
  const count = useCart((s) => s.items.reduce((n, i) => n + i.qty, 0));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[520px] border-t border-line bg-paper/85 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                onClick={() => haptic(6)}
                className="relative flex h-14 flex-col items-center justify-center gap-[3px]"
              >
                {active && (
                  <motion.span
                    layoutId="tab-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-x-3 inset-y-1.5 -z-10 rounded-xl bg-chili-soft"
                  />
                )}
                <span className="relative">
                  <Icon
                    size={21}
                    weight={active ? "fill" : "regular"}
                    className={cn(
                      "transition-colors duration-200",
                      active ? "text-chili" : "text-ink-3",
                    )}
                  />
                  {href === "/cart" && count > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-[15px] rounded-full bg-chili px-1 text-center text-[10px] leading-[15px] font-medium text-white tabular-nums">
                      {count}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[10px] tracking-wide transition-colors duration-200",
                    active ? "text-chili" : "text-ink-3",
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
