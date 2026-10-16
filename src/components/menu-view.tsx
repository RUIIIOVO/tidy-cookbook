"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { catIcon } from "@/lib/icons";
import { categories, dishes, getDish, sections } from "@/data/dishes";
import type { SubId } from "@/data/types";
import { searchDishes } from "@/lib/search";
import { useCart } from "@/lib/store";
import { catTheme } from "@/lib/theme";
import { cn, haptic } from "@/lib/utils";
import {
  cancelIdlePreload,
  hasImage,
  preloadPriorityImages,
  scheduleIdlePreload,
} from "@/lib/images";
import { DishCard } from "./dish-card";

export function MenuView() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<SubId>(sections[0].key as SubId);
  const lockRef = useRef(0);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const animTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searching = q.trim().length > 0;

  /** 每个小类点了几「样」菜（去重后的品种数，不是份数）。
   *  份数已由底部购物车角标承担，这里显示品种数才不重复。 */
  const cartItems = useCart((s) => s.items);
  const pickedBySub = useMemo(() => {
    const m = new Map<SubId, number>();
    for (const it of cartItems) {
      const d = getDish(it.dishId);
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

  const scrollToSection = useCallback((key: string) => {
    const el = document.getElementById(`sec-${key}`);
    const container = listContainerRef.current;
    if (!el) return false;

    const targetY = Math.max(0, el.getBoundingClientRect().top + window.scrollY - 92);
    const startY = window.scrollY;
    const diff = targetY - startY;

    if (Math.abs(diff) < 4) return true;

    // 清理先前未结束的动画状态
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);

    if (!container) {
      window.scrollTo({ top: targetY, behavior: "instant" });
      return true;
    }

    // 业界顶级连续平滑滑屏：GPU 惯性位移补间（Kinetic Displacement Glide）
    // 视觉行程约束为大半屏（~0.72vh），既保证极其连续自然的物理减速滑入感，又杜绝数千像素满屏残影与掉帧
    const maxVisualTravel = Math.min(Math.abs(diff), window.innerHeight * 0.72);
    const offsetFrom = diff > 0 ? maxVisualTravel : -maxVisualTravel;

    // 1. 瞬间定位真实滚动位置
    window.scrollTo({ top: targetY, behavior: "instant" });

    // 2. 同一帧施加反向物理偏移，抵消瞬变，画面连贯自然
    container.style.transition = "none";
    container.style.transform = `translate3d(0, ${offsetFrom}px, 0)`;
    container.style.willChange = "transform";

    // 3. 下一帧启动显卡硬件加速的连续减速滑入（320ms EaseOutQuart 物理阻尼）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!container) return;
        container.style.transition = "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)";
        container.style.transform = "translate3d(0, 0, 0)";
      });
    });

    animTimeoutRef.current = setTimeout(() => {
      if (container) {
        container.style.transition = "";
        container.style.transform = "";
        container.style.willChange = "";
      }
    }, 360);

    return true;
  }, []);

  const jump = useCallback(
    (key: string) => {
      haptic(8);
      setActive(key as SubId);
      lockRef.current = Date.now() + 600;

      // 1. 立即清除先前后台排队的所有低优先级空闲预热
      cancelIdlePreload();

      // 2. 靶向高优先级预热：立即将目标小类前 6 道菜提升为 P0 发起解码
      const targetSec = sections.find((s) => s.key === key);
      if (targetSec) {
        const prioritySrcs = targetSec.dishes
          .filter((d) => hasImage(d.id))
          .map((d) => d.image);
        preloadPriorityImages(prioritySrcs, 6);
      }

      // 3. 瞬时直达目标位置
      if (scrollToSection(key)) return;
      setQ("");
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToSection(key)));
    },
    [scrollToSection],
  );

  // 用户停留后空闲调度：轻量预热下一个紧邻小类（只预热 1 个，不再是 3 个）
  useEffect(() => {
    if (searching) return;
    const i = sections.findIndex((s) => s.key === active);
    if (i < 0) return;
    const nextSec = sections[i + 1];
    if (!nextSec) return;

    const srcs = nextSec.dishes
      .filter((d) => hasImage(d.id))
      .map((d) => d.image);
    scheduleIdlePreload(srcs, 2);
  }, [active, searching]);

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
                  {/* 一级分类：点击跳到它的第一个小类 */}
                  <button
                    type="button"
                    onClick={() => c.subs[0] && jump(c.subs[0].id)}
                    className="flex w-full items-center justify-center gap-1 px-2 pt-3 pb-1.5 active:opacity-60"
                  >
                    <Icon size={11} weight="fill" color={t.hex} style={{ opacity: 0.6 }} />
                    <span className="text-[9.5px] tracking-[0.15em] text-ink-3">
                      {c.name}
                    </span>
                  </button>
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
                        <span
                          className={cn(
                            "absolute inset-x-1.5 inset-y-0.5 rounded-lg transition-all duration-200",
                            on
                              ? "bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] opacity-100 scale-100"
                              : "opacity-0 scale-95 pointer-events-none",
                          )}
                        />
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
                {results.map((d, index) => (
                  <DishCard key={d.id} dish={d} priority={index < 6} />
                ))}
              </div>
              {results.length === 0 && (
                <p className="py-16 text-center font-display text-[15px] text-ink-3">
                  没有这道菜
                </p>
              )}
            </div>
          ) : (
            <div ref={listContainerRef} className="px-3.5 pb-24">
              {sections.map((s) => (
                <section
                  key={s.key}
                  id={`sec-${s.key}`}
                  className="scroll-mt-24 pt-5 [content-visibility:auto] [contain-intrinsic-size:1px_360px]"
                >
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
                    {s.dishes.map((d, index) => (
                      <DishCard
                        key={d.id}
                        dish={d}
                        priority={s.key === active && index < 6}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
