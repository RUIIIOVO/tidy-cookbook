"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { catIcon } from "@/lib/icons";
import { categories, dishById, dishes, sections } from "@/data/dishes";
import type { SubId } from "@/data/types";
import { searchDishes } from "@/lib/search";
import { useCart } from "@/lib/store";
import { catTheme } from "@/lib/theme";
import { cn, haptic } from "@/lib/utils";
import { scheduleIdlePreload } from "@/lib/images";
import { DishCard } from "./dish-card";
import { DishSheet } from "./dish-sheet";
import { CustomOptionDrawer } from "./custom-option-drawer";

export function MenuView() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<SubId>(sections[0].key as SubId);
  const lockRef = useRef(0);
  const searching = q.trim().length > 0;

  /** 每个小类点了几「样」菜（去重后的品种数，不是份数）。
   *  份数已由底部购物车角标承担，这里显示品种数才不重复。 */
  const cartItems = useCart((s) => s.items);
  const pickedBySub = useMemo(() => {
    const m = new Map<SubId, number>();
    for (const it of cartItems) {
      const d = dishById.get(it.dishId);
      if (d) m.set(d.sub, (m.get(d.sub) ?? 0) + 1);
    }
    return m;
  }, [cartItems]);

  const results = useMemo(() => (searching ? searchDishes(dishes, q) : []), [q, searching]);

  // scroll-spy
  useEffect(() => {
    if (searching) return;
    const onScroll = () => {
      if (Date.now() < lockRef.current) return;
      // 滚到底了：最后一节永远到不了顶，直接认定为最后一个分类
      const atBottom =
        window.innerHeight + window.scrollY >= document.body.scrollHeight - 4;
      if (atBottom) {
        setActive(sections[sections.length - 1].key as SubId);
        return;
      }
      let current = sections[0].key;
      for (const s of sections) {
        const el = document.getElementById(`sec-${s.key}`);
        if (el && el.getBoundingClientRect().top <= 108) current = s.key;
      }
      setActive(current as SubId);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [searching]);

  const jump = useCallback((key: string) => {
    haptic(8);
    setActive(key as SubId);
    lockRef.current = Date.now() + 900;
    const el = document.getElementById(`sec-${key}`);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 92;
    window.scrollTo({ top: y, behavior: "smooth" });
  }, []);

  // 页面空闲时，静默预热所有菜品配图，切换分类或滚动时直接读取内存解码纹理，消除白屏
  useEffect(() => {
    const allImages = dishes.map((d) => d.image);
    scheduleIdlePreload(allImages, 4);
  }, []);

  return (
    <div className="relative">
      <div className="flex items-start">
        {/* ── 左侧竖向分类导航 ───────────────── */}
        <aside
          className={cn(
            "no-scrollbar sticky top-0 z-20 w-[64px] shrink-0 overflow-y-auto border-r border-line bg-paper-2/40",
            "h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))]",
          )}
        >
          <div className="flex flex-col py-2.5">
            {categories.map((c) => {
              const t = catTheme[c.id];
              const Icon = catIcon[c.id];
              return (
                <div key={c.id} className="mb-1">
                  <div className="flex items-center justify-center gap-1 px-2 pt-3 pb-1.5">
                    <Icon size={11} weight="fill" color={t.hex} style={{ opacity: 0.6 }} />
                    <span className="text-[9.5px] tracking-[0.15em] text-ink-3">
                      {c.name}
                    </span>
                  </div>
                  {c.subs.map((s) => {
                    const on = active === s.id && !searching;
                    const picked = pickedBySub.get(s.id) ?? 0;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => jump(s.id)}
                        className="relative flex h-9 w-full items-center justify-center"
                      >
                        {on && (
                          <motion.span
                            layoutId="rail-pill"
                            transition={{ type: "spring", stiffness: 500, damping: 40 }}
                            className="absolute inset-x-1.5 inset-y-0.5 rounded-lg bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                          />
                        )}
                        <span
                          className={cn(
                            "relative text-[12px] leading-none whitespace-nowrap transition-colors duration-200",
                            on ? "font-medium" : "text-ink-3",
                          )}
                          style={on ? { color: t.hex } : undefined}
                        >
                          {s.name}
                        </span>
                        {picked > 0 && (
                          <span
                            aria-label={`已点 ${picked} 样`}
                            className="absolute top-0.5 right-1 grid size-[14px] place-items-center rounded-full bg-accent text-[9px] leading-none font-medium text-white tabular-nums"
                          >
                            {picked}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── 右侧列表 ───────────────────────── */}
        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-10 bg-paper/90 px-3.5 pt-3 pb-2.5 backdrop-blur-lg hairline-b">
            <div className="flex items-center gap-2 rounded-full border border-line bg-card px-3 py-2">
              <MagnifyingGlass size={15} className="shrink-0 text-ink-3" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜菜名、拼音首字母、食材"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
              />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="清空">
                  <X size={14} className="text-ink-3" />
                </button>
              )}
            </div>
          </div>

          {searching ? (
            <div className="px-3.5 pt-3 pb-8">
              <p className="mb-2.5 text-[11px] text-ink-3">
                找到 <span className="tabular-nums text-ink">{results.length}</span> 道
              </p>
              <div className="space-y-2">
                {results.map((d) => (
                  <DishCard key={d.id} dish={d} />
                ))}
              </div>
              {results.length === 0 && (
                <p className="py-16 text-center font-display text-[15px] text-ink-3">
                  没有这道菜
                </p>
              )}
            </div>
          ) : (
            <div className="px-3.5 pb-24">
              {sections.map((s) => (
                <section key={s.key} id={`sec-${s.key}`} className="scroll-mt-24 pt-5">
                  <div className="mb-2.5 flex items-baseline gap-2">
                    <h2 className="font-display text-[15px] tracking-[0.2em] text-ink">
                      {s.subName}
                    </h2>
                    <span
                      className="text-[10px] tabular-nums"
                      style={{ color: catTheme[s.category].hex, opacity: 0.7 }}
                    >
                      {s.dishes.length}
                    </span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  <div className="space-y-2">
                    {s.dishes.map((d) => (
                      <DishCard key={d.id} dish={d} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <DishSheet />
      <CustomOptionDrawer />
    </div>
  );
}
