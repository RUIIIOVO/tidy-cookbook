"use client";

import { useState } from "react";
import { Check, PencilSimple, SealCheck, Trash } from "@phosphor-icons/react";
import { ShoppingList } from "./shopping-list";
import { useConfirm } from "@/lib/confirm-store";
import { toast } from "sonner";
import Link from "next/link";
import { categories, getDish } from "@/data/dishes";
import type { CategoryId } from "@/data/types";
import { useCart } from "@/lib/store";
import { catTheme } from "@/lib/theme";
import { useDishSheet } from "@/lib/ui-store";
import { cn, haptic } from "@/lib/utils";
import { AddButton } from "./add-button";
import { DishSheet } from "./dish-sheet";
import { DishThumb } from "./dish-thumb";

export function CartView() {
  const items = useCart((s) => s.items);
  const locked = useCart((s) => s.locked);
  const lock = useCart((s) => s.lock);
  const unlock = useCart((s) => s.unlock);
  const removeMany = useCart((s) => s.removeMany);
  const clear = useCart((s) => s.clear);
  const openSheet = useDishSheet((s) => s.open);
  const confirm = useConfirm((s) => s.confirm);

  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const rows = items
    .map((i) => ({ item: i, dish: getDish(i.dishId)! }))
    .filter((r) => r.dish);

  const byCat = categories
    .map((c) => ({
      cat: c.id as CategoryId,
      name: c.name,
      rows: rows.filter((r) => r.dish.category === c.id),
    }))
    .filter((g) => g.rows.length > 0);

  const total = rows.reduce((n, r) => n + r.item.qty, 0);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-8 text-center">
        <p className="font-display text-[18px] tracking-wider text-ink">还没点菜</p>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
          去菜单挑几道，或者回首页抽一道
        </p>
        <Link
          href="/menu"
          className="mt-6 rounded-full bg-ink px-6 py-2.5 text-[13px] text-paper"
        >
          翻菜单
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-[22px] tracking-wider text-ink">点菜单</h1>
          <p className="mt-1 text-[11px] text-ink-3">
            共 <span className="tabular-nums text-ink-2">{rows.length}</span> 道 ·{" "}
            <span className="tabular-nums text-ink-2">{total}</span> 份
            {locked && <span className="ml-2 text-chili">已确认</span>}
          </p>
        </div>
        {!locked && (
          <button
            type="button"
            onClick={() => {
              setSelecting((v) => !v);
              setPicked([]);
            }}
            className="text-[12px] text-ink-2 underline decoration-line-2 underline-offset-4"
          >
            {selecting ? "取消" : "管理"}
          </button>
        )}
      </header>

      <div className="mt-4 space-y-5 pb-36">
        {byCat.map((g) => (
          <section key={g.cat}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2
                className="font-display text-[13px] tracking-[0.2em]"
                style={{ color: catTheme[g.cat].hex }}
              >
                {g.name}
              </h2>
              <span className="text-[10px] text-ink-3 tabular-nums">{g.rows.length}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="space-y-2">
              {g.rows.map(({ item, dish }) => {
                const on = picked.includes(dish.id);
                return (
                  <div
                    key={dish.id}
                    onClick={() => {
                      if (selecting) {
                        haptic(6);
                        setPicked((p) =>
                          p.includes(dish.id)
                            ? p.filter((x) => x !== dish.id)
                            : [...p, dish.id],
                        );
                      } else {
                        openSheet(dish.id);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-card border bg-card p-2.5 transition",
                      on ? "border-chili/40 bg-chili-soft/40" : "border-line",
                    )}
                  >
                    {selecting && (
                      <span
                        className={cn(
                          "grid size-[18px] shrink-0 place-items-center rounded-full border",
                          on ? "border-chili bg-chili text-white" : "border-line-2",
                        )}
                      >
                        {on && <Check size={11} weight="bold" />}
                      </span>
                    )}
                    <DishThumb dish={dish} className="size-[46px] shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-display text-[15px] tracking-wide text-ink">
                        {dish.name}
                      </h3>
                      <p className="mt-0.5 text-[10.5px] text-ink-3 tabular-nums">
                        {dish.minutes} 分钟
                      </p>
                    </div>
                    {selecting ? (
                      <span className="text-[12px] text-ink-3 tabular-nums">
                        ×{item.qty}
                      </span>
                    ) : locked ? (
                      <span className="text-[13px] text-ink-2 tabular-nums">
                        ×{item.qty}
                      </span>
                    ) : (
                      <AddButton dish={dish} confirmRemove />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <ShoppingList rows={rows.map((r) => ({ dish: r.dish, qty: r.item.qty }))} />
      </div>

      {/* 底部操作条 */}
      <div
        className="fixed inset-x-0 bottom-14 z-30 mx-auto max-w-[520px] border-t border-line bg-paper/92 px-4 py-3 backdrop-blur-lg"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {selecting ? (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                setPicked(picked.length === rows.length ? [] : rows.map((r) => r.dish.id))
              }
              className="rounded-full border border-line bg-card px-4 py-2.5 text-[13px] text-ink-2"
            >
              {picked.length === rows.length ? "取消全选" : "全选"}
            </button>
            <button
              type="button"
              disabled={picked.length === 0}
              onClick={() => {
                const names = picked
                  .map((id) => rows.find((r) => r.dish.id === id)?.dish.name)
                  .filter(Boolean)
                  .join("、");
                confirm({
                  title: `从这一餐里删掉 ${picked.length} 道？`,
                  desc: names.length > 40 ? `${names.slice(0, 40)}…` : names,
                  confirmText: "删除",
                  onConfirm: () => {
                    removeMany(picked);
                    toast(`已删除 ${picked.length} 道`);
                    setPicked([]);
                    setSelecting(false);
                  },
                });
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-chili py-2.5 text-[13px] text-white disabled:opacity-40"
            >
              <Trash size={14} weight="regular" />
              删除 {picked.length > 0 && <span className="tabular-nums">{picked.length}</span>}
            </button>
          </div>
        ) : locked ? (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                haptic(15);
                unlock();
                toast("可以继续改了");
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-line-2 bg-card py-3 text-[14px] tracking-wide text-ink"
            >
              <PencilSimple size={16} weight="regular" />
              重新编辑
            </button>
            <button
              type="button"
              onClick={() =>
                confirm({
                  title: "开始下一餐？",
                  desc: "这一餐会被清空，已经确认过的记录不受影响。",
                  confirmText: "清空",
                  onConfirm: () => {
                    clear();
                    toast("清空了，重新点吧");
                  },
                })
              }
              className="rounded-full bg-ink px-5 py-3 text-[14px] tracking-wide text-paper"
            >
              下一餐
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              haptic(25);
              lock();
              toast("这一餐定了");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-[14px] tracking-wide text-paper transition active:scale-[0.99]"
          >
            <SealCheck size={16} weight="regular" />
            就这么吃
          </button>
        )}
      </div>

      <DishSheet />
    </div>
  );
}
