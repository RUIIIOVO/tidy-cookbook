"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, Minus, Plus, X } from "@phosphor-icons/react";
import { categories, dishes, getDish, sections } from "@/data/dishes";
import type { Dish, SubId } from "@/data/types";
import { elementScroller, glideScroll } from "@/lib/glide-scroll";
import { catIcon } from "@/lib/icons";
import { searchDishes } from "@/lib/search";
import { catTheme } from "@/lib/theme";
import { cn, haptic } from "@/lib/utils";
import { useBackClose } from "@/lib/use-back-close";
import { DishThumb } from "./dish-thumb";

/** 订单编辑草稿里的一行 */
export type DraftItem = { dishId: string; qty: number };

const MAX_QTY = 99;
/** 搜索结果最多渲染多少道，避免一次塞几百行 */
const MAX_RESULTS = 60;
/** 一张卡片（52 缩略图 + 内边距 + 边框）加间距的高度，估算分段高度给 content-visibility 用 */
const CARD_H = 78;
const SEC_HEAD_H = 46;

/**
 * 加减份数步进器（视觉与 AddButton 一致，但绑定编辑草稿，不碰点菜单）。
 * qty 为 0 时只显示一个 ＋；减到 0 由调用方决定是移除这一行（还是先弹确认）。
 */
export function QtyStepper({
  qty,
  name,
  onChange,
  disabled,
}: {
  qty: number;
  name: string;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  if (qty <= 0) {
    return (
      <button
        type="button"
        aria-label={`加入${name}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          haptic();
          onChange(1);
        }}
        className="grid size-[26px] shrink-0 place-items-center rounded-full border border-line-2 bg-card text-ink-2 transition active:scale-90 disabled:opacity-50"
      >
        <Plus size={14} weight="bold" />
      </button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-1 py-0.5">
      <button
        type="button"
        aria-label={`减少${name}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          haptic(8);
          onChange(qty - 1);
        }}
        className="grid size-[20px] place-items-center rounded-full text-accent transition active:scale-90 disabled:opacity-50"
      >
        <Minus size={12} weight="bold" />
      </button>
      <span className="min-w-[10px] text-center text-[12px] font-medium text-accent tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        aria-label={`增加${name}`}
        disabled={disabled || qty >= MAX_QTY}
        onClick={(e) => {
          e.stopPropagation();
          haptic();
          onChange(Math.min(MAX_QTY, qty + 1));
        }}
        className="grid size-[20px] place-items-center rounded-full text-accent transition active:scale-90 disabled:opacity-50"
      >
        <Plus size={12} weight="bold" />
      </button>
    </div>
  );
}

/**
 * 独立的全屏选菜弹窗：叠在订单编辑面板之上。
 * 加的菜只进编辑草稿（onSetQty），不碰点菜单。✕ 和「好了」效果一样，改动都留在草稿里。
 */
export function DishPickerSheet({
  open,
  onClose,
  title,
  items,
  onSetQty,
}: {
  open: boolean;
  onClose: () => void;
  /** 「给 …… 加」里的订单名，如「明天 · 午餐」 */
  title: string;
  items: DraftItem[];
  onSetQty: (dishId: string, qty: number) => void;
}) {
  useBackClose(open, onClose);

  // 打开后先挂载、下一帧再滑入；关闭时先滑出、动画结束再卸载
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y0: number; t0: number } | null>(null);
  // 打开时立即挂载（渲染期派生，不走 effect）
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    const id = requestAnimationFrame(() => setShown(false));
    const t = setTimeout(() => setMounted(false), 300);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, [open]);

  if (!mounted) return null;

  // 顶部把手 / 标题区下滑关闭；列表区只负责滚动
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y0: e.clientY, t0: Date.now() };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setDragY(Math.max(0, e.clientY - drag.current.y0));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    const speed = dragY / Math.max(1, Date.now() - d.t0);
    if (dragY > 120 || speed > 0.6) onClose();
    setDragY(0);
  };

  // 铺在修改订单抽屉的内部，而不是挂到 body 上：抽屉是 Radix 模态框，
  // 会把它外面的区域设成不可点、并拦掉触摸滚动，挂到外面就会滚不动、点不了，像卡死。
  // React 事件仍要在根上拦住，免得冒泡到抽屉被当成下拉拖拽。
  return (
    <div
      className="absolute inset-0 z-20 overflow-hidden rounded-t-2xl"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-label="添加菜品"
        className="absolute inset-0 flex flex-col bg-paper"
        style={{
          transform: shown ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: dragging ? "none" : "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div
          className="shrink-0 cursor-grab touch-none pt-2.5 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-line-2" />
          <PickerHeader title={title} />
        </div>
        <PickerBody items={items} onSetQty={onSetQty} onClose={onClose} />
      </div>
    </div>
  );
}

/** 标题区：整块都能按住下滑关闭 */
function PickerHeader({ title }: { title: string }) {
  return (
    <div className="flex items-baseline gap-2 px-5 pt-3 pb-3">
      <h2 className="font-display text-[22px] leading-tight tracking-wider text-ink">添加菜品</h2>
      <span className="truncate text-[12px] text-ink-3">{title}</span>
    </div>
  );
}

function PickerBody({
  items,
  onSetQty,
  onClose,
}: {
  items: DraftItem[];
  onSetQty: (dishId: string, qty: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<SubId>(sections[0].key as SubId);
  const searching = q.trim().length > 0;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const secRefs = useRef(new Map<string, HTMLElement>());
  const railBtnRefs = useRef(new Map<string, HTMLElement>());
  /** 点击跳转期间锁住滚动高亮，滚到位（或超时、用户触屏）才解锁 */
  const lockRef = useRef<{ key: string; y: number; until: number; tries: number } | null>(null);
  const glideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 打开时草稿里已有的菜；「新加」= 现在有、打开时没有的品种数
  const [initialIds] = useState(() => new Set(items.map((i) => i.dishId)));
  const added = items.reduce((n, i) => n + (initialIds.has(i.dishId) ? 0 : 1), 0);

  const qtyOf = useMemo(() => new Map(items.map((i) => [i.dishId, i.qty])), [items]);

  // 每个小类里已选了几样（品种数），挂在左栏上
  const pickedBySub = useMemo(() => {
    const m = new Map<SubId, number>();
    for (const it of items) {
      const d = getDish(it.dishId);
      if (d) m.set(d.sub, (m.get(d.sub) ?? 0) + 1);
    }
    return m;
  }, [items]);

  const results = useMemo(() => (searching ? searchDishes(dishes, q) : []), [q, searching]);

  /** 小类顶端对齐滚动容器顶部所需的 scrollTop；不超过可滚范围 */
  const sectionTop = useCallback((key: string) => {
    const sc = scrollerRef.current;
    const el = secRefs.current.get(key);
    if (!sc || !el) return null;
    const y = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    return Math.max(0, Math.min(y, sc.scrollHeight - sc.clientHeight));
  }, []);

  const cancelGlide = useCallback(() => {
    if (glideTimer.current) clearTimeout(glideTimer.current);
    glideTimer.current = null;
    lockRef.current = null;
  }, []);

  // 末段留白：让最后一个小类也能滚到容器顶端，否则点左栏最后几项会对不齐
  useEffect(() => {
    const sc = scrollerRef.current;
    const tail = tailRef.current;
    if (!sc || !tail) return;
    const last = sections[sections.length - 1].key;
    // 按实际位置算：可滚到的最大 scrollTop 要不小于最后一节的顶端。
    // 最后一节是 content-visibility:auto，打开时量到的是估算高度，真正渲染后会变；
    // 不跟着重算的话最后一节滚不到顶、高亮停在上一节
    const measure = () => {
      const el = secRefs.current.get(last);
      if (!el) return;
      const cur = tail.offsetHeight;
      const lastTop = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
      const need = lastTop + sc.clientHeight - (sc.scrollHeight - cur);
      tail.style.height = `${Math.max(0, Math.ceil(need))}px`;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sc);
    const lastEl = secRefs.current.get(last);
    if (lastEl) ro.observe(lastEl);
    return () => ro.disconnect();
  }, [searching]);

  // 滚动联动高亮：顶端越过容器顶部基准线的最后一个小类即当前小类
  useEffect(() => {
    if (searching) return;
    const sc = scrollerRef.current;
    if (!sc) return;
    const onScroll = () => {
      const lock = lockRef.current;
      if (lock) {
        if (Date.now() < lock.until) {
          // 还在滚向目标：不动高亮
          if (Math.abs(sc.scrollTop - lock.y) > 2) return;
          // 到位了。分段是 content-visibility:auto，沿途渲染后位置可能有偏差，重新对一次
          const y2 = sectionTop(lock.key);
          if (y2 !== null && Math.abs(y2 - sc.scrollTop) > 2 && lock.tries < 2) {
            lock.tries++;
            lock.y = y2;
            lock.until = Date.now() + 600;
            sc.scrollTo({ top: y2, behavior: "instant" });
            return;
          }
        }
        lockRef.current = null;
      }
      const line = sc.getBoundingClientRect().top + 8;
      let current: string = sections[0].key;
      for (const s of sections) {
        const el = secRefs.current.get(s.key);
        if (el && el.getBoundingClientRect().top <= line) current = s.key;
      }
      setActive(current as SubId);
    };
    onScroll();
    sc.addEventListener("scroll", onScroll, { passive: true });
    // 用户手指 / 滚轮介入时立刻放弃自动跳转，避免和手势抢
    sc.addEventListener("touchstart", cancelGlide, { passive: true });
    sc.addEventListener("wheel", cancelGlide, { passive: true });
    return () => {
      sc.removeEventListener("scroll", onScroll);
      sc.removeEventListener("touchstart", cancelGlide);
      sc.removeEventListener("wheel", cancelGlide);
    };
  }, [searching, cancelGlide, sectionTop]);

  useEffect(() => cancelGlide, [cancelGlide]);

  // 换搜索词，结果列表回到顶部
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [q]);

  // 左栏跟随：高亮项滚出左栏可视范围时带回来
  useEffect(() => {
    if (searching) return;
    const rail = railRef.current;
    const btn = railBtnRefs.current.get(active);
    if (!rail || !btn) return;
    const r = rail.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const pad = 36;
    if (b.top < r.top + pad) rail.scrollTo({ top: rail.scrollTop - (r.top + pad - b.top), behavior: "smooth" });
    else if (b.bottom > r.bottom - pad)
      rail.scrollTo({ top: rail.scrollTop + (b.bottom - (r.bottom - pad)), behavior: "smooth" });
  }, [active, searching]);

  /** 平滑滚到小类：近处直接平滑；远处先定位到目标前 GLIDE_PX，再平滑滚完这一段 */
  const glideTo = useCallback(
    (key: string) => {
      const sc = scrollerRef.current;
      const y = sectionTop(key);
      if (!sc || y === null) return;
      cancelGlide();
      glideTimer.current = glideScroll(elementScroller(sc), y, () => sectionTop(key), (top) => {
        lockRef.current = { key, y: top, until: Date.now() + 1200, tries: 0 };
      });
    },
    [sectionTop, cancelGlide],
  );

  const jump = (key: SubId) => {
    haptic(8);
    setActive(key);
    glideTo(key);
  };

  return (
    <>
      {/* 搜索 */}
      <div className="shrink-0 px-4 pb-2.5">
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

      <div className="flex min-h-0 flex-1 border-t border-line">
        {/* 左侧竖向分类栏：搜索时隐藏 */}
        {!searching && (
          <aside
            ref={railRef}
            data-vaul-no-drag
            className="no-scrollbar w-[64px] shrink-0 overflow-y-auto overscroll-contain border-r border-line bg-paper-2/40"
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
                      <span className="text-[9.5px] tracking-[0.15em] text-ink-3">{c.name}</span>
                    </button>
                    {c.subs.map((s) => {
                      const on = active === s.id;
                      const picked = pickedBySub.get(s.id) ?? 0;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          ref={(el) => {
                            if (el) railBtnRefs.current.set(s.id, el);
                            else railBtnRefs.current.delete(s.id);
                          }}
                          onClick={() => jump(s.id)}
                          className="relative flex h-9 w-full items-center justify-center"
                        >
                          <span
                            className={cn(
                              "absolute inset-x-1.5 inset-y-0.5 rounded-lg transition-all duration-200",
                              on
                                ? "scale-100 bg-card opacity-100 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                                : "pointer-events-none scale-95 opacity-0",
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
                              aria-label={`已选 ${picked} 样`}
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
        )}

        {/* 右侧：连续滚动的菜品列表（弹窗内独立滚动容器） */}
        <div
          ref={scrollerRef}
          data-vaul-no-drag
          className="no-scrollbar relative min-w-0 flex-1 overflow-y-auto overscroll-contain px-3.5"
        >
          {searching ? (
            <div className="pt-3 pb-8">
              <p className="mb-2.5 text-[11px] text-ink-3">
                找到 <span className="tabular-nums text-ink">{results.length}</span> 道
                {results.length > MAX_RESULTS && `，先显示前 ${MAX_RESULTS} 道`}
              </p>
              <div className="space-y-2">
                {results.slice(0, MAX_RESULTS).map((d) => (
                  <PickCard key={d.id} dish={d} qty={qtyOf.get(d.id) ?? 0} onSetQty={onSetQty} />
                ))}
              </div>
              {results.length === 0 && (
                <p className="py-16 text-center font-display text-[15px] text-ink-3">没有这道菜</p>
              )}
            </div>
          ) : (
            <>
              {sections.map((s) => (
                <section
                  key={s.key}
                  ref={(el) => {
                    if (el) secRefs.current.set(s.key, el);
                    else secRefs.current.delete(s.key);
                  }}
                  // 屏外的分段跳过渲染；auto 会记住渲染过的真实高度，这里先给个估算
                  style={{
                    containIntrinsicSize: `auto ${SEC_HEAD_H + s.dishes.length * CARD_H}px`,
                  }}
                  className="pt-3.5 [content-visibility:auto]"
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
                    {s.dishes.map((d) => (
                      <PickCard key={d.id} dish={d} qty={qtyOf.get(d.id) ?? 0} onSetQty={onSetQty} />
                    ))}
                  </div>
                </section>
              ))}
              <div ref={tailRef} aria-hidden />
            </>
          )}
        </div>
      </div>

      {/* 底部固定：关闭 */}
      <div className="shrink-0 border-t border-line bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="flex w-full items-center justify-center rounded-full bg-accent py-3.5 text-[14px] font-medium tracking-wider text-white transition active:scale-[0.99]"
        >
          {added > 0 ? `新加 ${added} 道 · 完成` : "完成"}
        </button>
      </div>
    </>
  );
}

/** 紧凑菜品卡：缩略图 + 菜名 + 一个标签，右侧步进器。整张卡不可点，只有步进器 */
const PickCard = memo(function PickCard({
  dish,
  qty,
  onSetQty,
}: {
  dish: Dish;
  qty: number;
  onSetQty: (dishId: string, qty: number) => void;
}) {
  const tag = dish.tags[0];
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-card border bg-card p-2",
        qty > 0 ? "border-accent/40" : "border-line",
      )}
    >
      <DishThumb dish={dish} className="size-[52px] shrink-0 rounded-lg" sizes="52px" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-[15px] leading-tight tracking-wide text-ink">
          {dish.name}
        </h3>
        {tag && (
          <span className="mt-1 inline-block max-w-full truncate rounded-full bg-paper-2 px-2 py-0.5 align-top text-[10.5px] leading-tight text-ink-3">
            {tag}
          </span>
        )}
      </div>
      <QtyStepper qty={qty} name={dish.name} onChange={(n) => onSetQty(dish.id, n)} />
    </div>
  );
});
