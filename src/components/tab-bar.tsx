"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/store";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "抽菜", glyph: "签" },
  { href: "/menu", label: "菜单", glyph: "菜" },
  { href: "/cart", label: "点菜单", glyph: "单" },
  { href: "/history", label: "历史", glyph: "史" },
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
        {TABS.map((t) => {
          const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className="relative flex h-14 flex-col items-center justify-center gap-0.5"
              >
                <span
                  className={cn(
                    "relative font-display text-[17px] leading-none transition-colors",
                    active ? "text-chili" : "text-ink-3",
                  )}
                >
                  {t.glyph}
                  {t.href === "/cart" && count > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[15px] rounded-full bg-chili px-1 text-center font-sans text-[10px] leading-[15px] text-white">
                      {count}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[10px] tracking-wide transition-colors",
                    active ? "text-ink" : "text-ink-3",
                  )}
                >
                  {t.label}
                </span>
                {active && (
                  <span className="absolute top-0 h-[2px] w-6 rounded-full bg-chili" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
