"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import { MagnifyingGlass, Minus, Plus, X } from "@phosphor-icons/react";
import { dishes, sections } from "@/data/dishes";
import type { Dish } from "@/data/types";
import { searchDishes } from "@/lib/search";
import { catTheme } from "@/lib/theme";
import { cn, haptic } from "@/lib/utils";
import { DishThumb } from "./dish-thumb";

/** 订单编辑草稿里的一行 */
export type DraftItem = { dishId: string; qty: number };

const MAX_QTY = 99;
/** 搜索结果最多渲染多少道，避免一次塞几百行 */
const MAX_RESULTS = 60;

// ── 系统返回手势 / 浏览器后退：只关闭最上层的弹层 ──────────────────────────
// 弹层打开时往历史栈里压一条同地址记录，后退（popstate）就弹出最上层；
// 弹层是被界面关掉的，再把那条记录退回去，栈始终是平衡的。
type Layer = { back: () => void };
const layers: Layer[] = [];
let skipPop = 0;
let listening = false;

function onPopState() {
  if (skipPop > 0) {
    skipPop--;
    return;
  }
  const top = layers.pop();
  if (!top) return;
  top.back();
  // back() 可能只是弹了个「放弃修改？」确认而没真关；先补回记录，真关了会由 cleanup 退掉
  window.history.pushState(null, "", window.location.href);
  layers.push(top);
}

/**
 * open 为 true 期间，让系统返回手势 / 后退键触发 onBack（通常是关闭本弹层）。
 * onBack 里若弹了确认而没有真正关闭也没关系，弹层仍然在栈顶。
 */
export function useBackClose(open: boolean, onBack: () => void) {
  const ref = useRef(onBack);
  useEffect(() => {
    ref.current = onBack;
  });

  useEffect(() => {
    if (!open) return;
    if (!listening) {
      window.addEventListener("popstate", onPopState);
      listening = true;
    }
    const layer: Layer = { back: () => ref.current() };
    window.history.pushState(null, "", window.location.href);
    layers.push(layer);
    return () => {
      const i = layers.indexOf(layer);
      if (i < 0) return;
      layers.splice(i, 1);
      skipPop++;
      window.history.back();
    };
  }, [open]);
}

/**
 * 加减份数步进器（视觉仿 AddButton，但绑定编辑草稿，不碰点菜单）。
 * qty 为 0 时只显示一个 ＋；减到 0 由调用方决定是移除这一行。
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
        onClick={() => {
          haptic();
          onChange(1);
        }}
        className="grid size-[28px] shrink-0 place-items-center rounded-full border border-line-2 bg-card text-ink-2 transition active:scale-90 disabled:opacity-50"
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
        onClick={() => {
          haptic(8);
          onChange(qty - 1);
        }}
        className="grid size-[22px] place-items-center rounded-full text-accent transition active:scale-90 disabled:opacity-50"
      >
        <Minus size={12} weight="bold" />
      </button>
      <span className="min-w-[14px] text-center text-[12.5px] font-medium text-accent tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        aria-label={`增加${name}`}
        disabled={disabled || qty >= MAX_QTY}
        onClick={() => {
          haptic();
          onChange(Math.min(MAX_QTY, qty + 1));
        }}
        className="grid size-[22px] place-items-center rounded-full text-accent transition active:scale-90 disabled:opacity-50"
      >
        <Plus size={12} weight="bold" />
      </button>
    </div>
  );
}

/**
 * 独立的全屏选菜弹窗：叠在订单编辑面板之上。
 * 加的菜只进编辑草稿（onSetQty），不碰点菜单。
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
  /** 「加到：」后面显示的订单名，如「明天 · 午餐」 */
  title: string;
  items: DraftItem[];
  onSetQty: (dishId: string, qty: number) => void;
}) {
  useBackClose(open, onClose);

  return (
    <Drawer.NestedRoot
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      repositionInputs={false}
      scrollLockTimeout={0}
      closeThreshold={0.2}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[55] bg-ink/35" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[55] mx-auto flex h-[96dvh] max-w-[520px] flex-col rounded-t-2xl border-t border-line bg-paper outline-none">
          <PickerBody title={title} items={items} onSetQty={onSetQty} onClose={onClose} />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
  );
}

function PickerBody({
  title,
  items,
  onSetQty,
  onClose,
}: {
  title: string;
  items: DraftItem[];
  onSetQty: (dishId: string, qty: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string>(sections[0].key);
  const listRef = useRef<HTMLDivElement>(null);
  const searching = q.trim().length > 0;

  const qtyOf = useMemo(() => new Map(items.map((i) => [i.dishId, i.qty])), [items]);

  // 每个小类里已选了几样，挂在分类胶囊上
  const pickedBySub = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sections) {
      const n = s.dishes.reduce((c, d) => c + (qtyOf.has(d.id) ? 1 : 0), 0);
      if (n > 0) m.set(s.key, n);
    }
    return m;
  }, [qtyOf]);

  const results = useMemo(() => (searching ? searchDishes(dishes, q) : []), [q, searching]);
  const section = sections.find((s) => s.key === active) ?? sections[0];
  const list: Dish[] = searching ? results.slice(0, MAX_RESULTS) : section.dishes;
  const pickedCount = items.length;

  // 切分类 / 换搜索词，列表回到顶部
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [active, q]);

  return (
    <>
      <div className="shrink-0 cursor-grab pt-3 pb-2 active:cursor-grabbing">
        <div className="mx-auto h-1 w-10 rounded-full bg-line-2" />
      </div>

      {/* 顶栏：加到哪一餐 + 完成 */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3">
        <div className="min-w-0">
          <Drawer.Title className="font-display text-[18px] tracking-wide text-ink">
            <span className="mr-1.5 text-[12px] font-normal tracking-normal text-ink-3">
              加到
            </span>
            {title}
          </Drawer.Title>
          <Drawer.Description className="sr-only">
            搜索或按分类挑菜，加减份数后点完成
          </Drawer.Description>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-[13px] font-medium tracking-wider text-white transition active:scale-95"
        >
          完成{pickedCount > 0 && <span className="ml-1 tabular-nums">· {pickedCount}</span>}
        </button>
      </div>

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

      {/* 分类胶囊：搜索时隐藏 */}
      {!searching && (
        <div
          data-vaul-no-drag
          className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 pb-2.5"
        >
          {sections.map((s) => {
            const on = s.key === active;
            const picked = pickedBySub.get(s.key) ?? 0;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  haptic(6);
                  setActive(s.key);
                }}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full border px-3.5 py-1.5 text-[12px] transition active:scale-95",
                  on
                    ? "border-accent bg-accent font-medium text-white"
                    : "border-line bg-card text-ink-2",
                )}
              >
                {s.subName}
                {picked > 0 && (
                  <span
                    className={cn(
                      "grid min-w-[14px] place-items-center rounded-full px-1 text-[9.5px] leading-[14px] tabular-nums",
                      on ? "bg-white/25 text-white" : "bg-accent text-white",
                    )}
                  >
                    {picked}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 菜品列表：只渲染当前分类 / 搜索结果 */}
      <div
        ref={listRef}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        {searching && (
          <p className="mb-2.5 text-[11px] text-ink-3">
            找到 <span className="tabular-nums text-ink">{results.length}</span> 道
            {results.length > MAX_RESULTS && `，先显示前 ${MAX_RESULTS} 道`}
          </p>
        )}
        <ul className="space-y-2">
          {list.map((d) => (
            <PickRow key={d.id} dish={d} qty={qtyOf.get(d.id) ?? 0} onSetQty={onSetQty} />
          ))}
        </ul>
        {searching && results.length === 0 && (
          <p className="py-16 text-center font-display text-[15px] text-ink-3">没有这道菜</p>
        )}
      </div>
    </>
  );
}

function PickRow({
  dish,
  qty,
  onSetQty,
}: {
  dish: Dish;
  qty: number;
  onSetQty: (dishId: string, qty: number) => void;
}) {
  const t = catTheme[dish.category];
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-card border bg-card p-2 [contain-intrinsic-size:auto_64px] [content-visibility:auto]",
        qty > 0 ? "border-accent/40" : "border-line",
      )}
    >
      <DishThumb dish={dish} className="size-12 shrink-0 rounded-[10px]" sizes="48px" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] tracking-wide text-ink">{dish.name}</p>
        {dish.tags.length > 0 && (
          <p className="mt-0.5 truncate text-[10.5px]" style={{ color: t.hex, opacity: 0.75 }}>
            {dish.tags.slice(0, 3).join(" · ")}
          </p>
        )}
      </div>
      <QtyStepper qty={qty} name={dish.name} onChange={(n) => onSetQty(dish.id, n)} />
    </li>
  );
}
