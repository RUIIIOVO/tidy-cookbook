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
  hasImage,
  preloadPriorityImages,
  scheduleIdlePreload,
} from "@/lib/images";
import { DishCard } from "./dish-card";

/** 长距离跳转时只平滑滑完最后这一段，前面直接定位 */
const GLIDE_PX = 320;

export function MenuView() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<SubId>(sections[0].key as SubId);
  const searching = q.trim().length > 0;

  const headerRef = useRef<HTMLDivElement>(null);
  /** 点击跳转期间锁住滚动高亮，滚到目标位置（或超时、用户触屏）才解锁 */
  const lockRef = useRef<{ y: number; until: number } | null>(null);
  const glideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /** 吸顶搜索栏高度：跳转落点和滚动高亮共用同一条基准线 */
  const headerH = () => headerRef.current?.offsetHeight ?? 0;

  /** 让该小类顶端贴住搜索栏底边所需的 scrollY；不超过页面可滚范围 */
  const sectionY = useCallback((key: string) => {
    const el = document.getElementById(`sec-${key}`);
    if (!el) return null;
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    const y = el.getBoundingClientRect().top + window.scrollY - headerH();
    return Math.max(0, Math.min(y, maxY));
  }, []);

  const cancelGlide = useCallback(() => {
    if (glideTimer.current) clearTimeout(glideTimer.current);
    glideTimer.current = null;
    lockRef.current = null;
  }, []);

  // 滚动高亮：顶端越过搜索栏底边的最后一个小类即当前小类
  useEffect(() => {
    if (searching) return;
    const onScroll = () => {
      const lock = lockRef.current;
      if (lock) {
        if (Math.abs(window.scrollY - lock.y) > 2 && Date.now() < lock.until) return;
        lockRef.current = null;
      }
      // 滚到底时最后一节到不了顶，直接认定为最后一个
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        setActive(sections[sections.length - 1].key as SubId);
        return;
      }
      const line = headerH() + 8;
      let current = sections[0].key;
      for (const s of sections) {
        const el = document.getElementById(`sec-${s.key}`);
        if (el && el.getBoundingClientRect().top <= line) current = s.key;
      }
      setActive(current as SubId);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    // 用户手指/滚轮介入时立刻放弃自动跳转，避免和手势抢
    window.addEventListener("touchstart", cancelGlide, { passive: true });
    window.addEventListener("wheel", cancelGlide, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", cancelGlide);
      window.removeEventListener("wheel", cancelGlide);
    };
  }, [searching, cancelGlide]);

  useEffect(() => cancelGlide, [cancelGlide]);

  /** 跳到小类：近处直接平滑滚；远处先定位到目标前 GLIDE_PX，再平滑滚完这一段 */
  const glideTo = useCallback(
    (key: string) => {
      const y = sectionY(key);
      if (y === null) return false;
      cancelGlide();
      const dy = y - window.scrollY;
      if (Math.abs(dy) < 2) return true;

      lockRef.current = { y, until: Date.now() + 1000 };
      if (Math.abs(dy) <= GLIDE_PX) {
        window.scrollTo({ top: y, behavior: "smooth" });
        return true;
      }
      window.scrollTo({ top: y - Math.sign(dy) * GLIDE_PX, behavior: "instant" });
      // 必须隔一个事件循环再 smooth，否则浏览器会把两次合并成一次长距离滚动。
      // 第二段重新取坐标，防止期间布局有变化
      glideTimer.current = setTimeout(() => {
        const y2 = sectionY(key) ?? y;
        lockRef.current = { y: y2, until: Date.now() + 1000 };
        window.scrollTo({ top: y2, behavior: "smooth" });
      }, 25);
      return true;
    },
    [sectionY, cancelGlide],
  );

  const jump = useCallback(
    (key: SubId) => {
      haptic(8);
      setActive(key);

      // 目标小类前几张图优先解码（内部会取消空闲预热队列）
      const sec = sections.find((s) => s.key === key);
      if (sec) {
        preloadPriorityImages(
          sec.dishes.filter((d) => hasImage(d.id)).map((d) => d.image),
          6,
        );
      }

      // 搜索状态下分类列表没渲染：先清空搜索，等列表出来再跳
      if (glideTo(key)) return;
      setQ("");
      requestAnimationFrame(() => requestAnimationFrame(() => glideTo(key)));
    },
    [glideTo],
  );

  // 停留后空闲预热下一个小类的图片
  useEffect(() => {
    if (searching) return;
    const i = sections.findIndex((s) => s.key === active);
    const next = sections[i + 1];
    if (i < 0 || !next) return;
    scheduleIdlePreload(
      next.dishes.filter((d) => hasImage(d.id)).map((d) => d.image),
      2,
    );
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
          <div ref={headerRef} className="sticky top-0 z-10 bg-paper/90 px-3.5 pt-3 pb-2.5 backdrop-blur-lg hairline-b">
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
            <div className="px-3.5 pb-[50vh]">
              {sections.map((s) => (
                <section
                  key={s.key}
                  id={`sec-${s.key}`}
                  className="pt-3.5"
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
