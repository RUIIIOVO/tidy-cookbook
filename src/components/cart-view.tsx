"use client";

import { useState } from "react";
import {
  BookOpen,
  Check,
  CookingPot,
  Knife,
  PencilSimple,
  Sparkle,
  Trash,
} from "@phosphor-icons/react";
import { useConfirm } from "@/lib/confirm-store";
import { toast } from "sonner";
import Link from "next/link";
import { categories, getDish } from "@/data/dishes";
import type { CategoryId } from "@/data/types";
import { useCart } from "@/lib/store";
import { useTabs } from "@/lib/tab-store";
import { catTheme } from "@/lib/theme";
import { useDishSheet } from "@/lib/ui-store";
import { ui } from "@/lib/ui";
import { cn, formatPersonName, haptic } from "@/lib/utils";
import { useGuard } from "@/lib/use-guard";
import { AddButton } from "./add-button";
import { SwipeRow } from "./swipe-row";
import { Avatar } from "./avatar";
import { DishThumb } from "./dish-thumb";
import { CUSTOM_CONFIGS, formatCustomSummary } from "@/data/custom-options";
import { useCustomStore } from "@/lib/custom-store";
import { useCustomModal } from "@/lib/custom-modal-store";
import { OrderConfirmSheet } from "./order-confirm-sheet";
import { mealDayOf, mealTitle, type Slot } from "@/lib/meal-time";
import { canDelete, useAuth } from "@/lib/auth-store";

export function CartView() {
  const items = useCart((s) => s.items);
  const today = useCart((s) => s.today);
  const removeMany = useCart((s) => s.removeMany);
  const clear = useCart((s) => s.clear);
  const openSheet = useDishSheet((s) => s.open);
  const openCustom = useCustomModal((s) => s.open);
  const getChoice = useCustomStore((s) => s.getChoice);
  const confirm = useConfirm((s) => s.confirm);
  const me = useAuth((s) => s.me);

  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const meals = useCart((s) => s.meals);
  const [lastOrder, setLastOrder] = useState<{
    date: string;
    slot: Slot;
    count: number;
    /** 在实时订单里见过这一单了（之后它没了，才说明被删 / 改走了） */
    seen?: boolean;
  } | null>(null);

  const removeOne = useCart((s) => s.remove);
  const setActiveTab = useTabs((s) => s.setActiveTab);

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


  // 最早的 addedAt 所属餐饮日
  const addedAts = items.map((i) => i.addedAt).filter((t): t is number => typeof t === "number" && t > 0);
  const earliestAddedAt = addedAts.length > 0 ? Math.min(...addedAts) : null;
  const earliestDay = earliestAddedAt ? mealDayOf(earliestAddedAt) : null;
  const isStale = earliestDay !== null && earliestDay < today;
  const staleDateText = earliestDay ? earliestDay.slice(5).replace("-", "/") : "";

  const openOrderConfirm = useGuard(() => {
    haptic(10);
    setOrderSheetOpen(true);
  }, 400);

  // 又开始点菜了，上一单的「已下单」提示就不再需要；否则之后手动删空点菜单会误显示它
  if (rows.length > 0 && lastOrder) setLastOrder(null);

  // 这单后来被删了（或被改到别的一餐）：「已下单」就不对了，收起提示。
  // 下单的回执可能比订单快照先到，所以要先在订单里「见过」它，之后又没了才算被删。
  // （补录到过去日期的订单不在实时快照里，见不到，就一直保留提示，不会误清）
  if (lastOrder) {
    const exists = meals.some((m) => m.mealDate === lastOrder.date && m.slot === lastOrder.slot);
    if (exists && !lastOrder.seen) setLastOrder({ ...lastOrder, seen: true });
    else if (!exists && lastOrder.seen) setLastOrder(null);
  }

  if (rows.length === 0) {
    // 空状态与备菜页同一版式：左上角页面标题，内容在剩余区域居中
    return (
      <div className="flex min-h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] flex-col px-4 pt-4">
        <header>
          <h1 className="font-display text-[22px] tracking-wider text-ink">点菜单</h1>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
          {lastOrder ? (
            <>
              <p className="font-display text-[18px] tracking-wider text-ink">
                已下单：{mealTitle(lastOrder.date, lastOrder.slot, today)} · {lastOrder.count} 道
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
                菜品已加入备菜，可查看买菜清单和配料
              </p>
              <div className="mt-6 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    haptic(6);
                    setActiveTab("prep");
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-[13px] text-white transition active:scale-[0.97]"
                >
                  <Knife size={15} weight="regular" />
                  去备菜
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic(6);
                    setActiveTab("menu");
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-line-2 bg-card px-5 py-2.5 text-[13px] text-ink transition active:scale-[0.97]"
                >
                  <BookOpen size={15} weight="regular" />
                  继续点餐
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="font-display text-[18px] tracking-wider text-ink">菜单空空</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
                天大地大，吃饭最大，快去点菜吧
              </p>
              <div className="mt-6 flex items-center gap-2.5">
                <Link
                  href="/menu/"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab("menu");
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-[13px] text-white transition active:scale-[0.97]"
                >
                  <BookOpen size={15} weight="regular" />
                  去点菜
                </Link>
                <Link
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab("draw");
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-line-2 bg-card px-5 py-2.5 text-[13px] text-ink transition active:scale-[0.97]"
                >
                  <Sparkle size={15} weight="regular" />
                  抽一道
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4">
      {/* 顶部吸顶栏：下滑滚动时标题与管理按钮常驻顶部，毛玻璃穿透 */}
      <header className="sticky top-0 z-20 -mx-4 -mt-4 bg-paper/90 px-4 pt-4 pb-3 backdrop-blur-lg hairline-b">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-[22px] tracking-wider text-ink">点菜单</h1>
            <p className="mt-1 text-[11px] text-ink-3">
              共 <span className="tabular-nums text-ink-2">{rows.length}</span> 道
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              haptic(6);
              setSelecting((v) => !v);
              setPicked([]);
            }}
            className={cn(
              ui.chip,
              selecting ? "border border-accent bg-accent-soft font-medium text-accent" : ui.chipOff,
            )}
          >
            {selecting ? (
              <>
                <Check size={12} weight="bold" />
                <span>完成</span>
              </>
            ) : (
              <>
                <PencilSimple size={12} weight="regular" />
                <span>管理</span>
              </>
            )}
          </button>
        </div>

        {/* 过去日期残留提示：早于 today 时显示 */}
        {isStale && (
          <div className="mt-2.5 flex items-center justify-between rounded-lg bg-paper-2 px-3 py-2 text-[11.5px] text-ink-2">
            <span>这些菜是 {staleDateText} 加的</span>
            {canDelete(me) && (
              <button
                type="button"
                onClick={() => {
                  confirm({
                    title: "清空点菜单？",
                    desc: "清空后需要重新添加。",
                    confirmText: "清空",
                    danger: true,
                    onConfirm: () => {
                      clear();
                      toast("点菜单已清空");
                    },
                  });
                }}
                className="font-medium text-chili transition active:opacity-70"
              >
                清空
              </button>
            )}
          </div>
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
                const isCustom = !!CUSTOM_CONFIGS[dish.id];
                const customSummary = isCustom
                  ? formatCustomSummary(dish.id, getChoice(dish.id))
                  : [];

                return (
                  <SwipeRow
                    key={dish.id}
                    open={swipedId === dish.id}
                    onOpenChange={(o) => setSwipedId(o ? dish.id : null)}
                    disabled={selecting}
                    onDelete={() => {
                      haptic(12);
                      removeOne(dish.id);
                      setSwipedId(null);
                      toast(`已移除 · ${dish.name}`);
                    }}
                  >
                    <div
                      onClick={() => {
                        if (selecting) {
                          haptic(6);
                          setPicked((p) =>
                            p.includes(dish.id)
                              ? p.filter((x) => x !== dish.id)
                              : [...p, dish.id],
                          );
                        } else if (isCustom) {
                          openCustom(dish.id);
                        } else {
                          openSheet(dish.id);
                        }
                      }}
                      className={cn(
                        "flex items-center gap-3 rounded-card border bg-card p-2.5 transition",
                        on ? "border-accent/40 bg-accent-soft/40" : "border-line",
                      )}
                    >
                      {selecting && (
                        <span
                          className={cn(
                            "grid size-[18px] shrink-0 place-items-center rounded-full border",
                            on ? "border-accent bg-accent text-white" : "border-line-2",
                          )}
                        >
                          {on && <Check size={11} weight="bold" />}
                        </span>
                      )}
                      <DishThumb dish={dish} className="size-[46px] shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="truncate font-display text-[15px] tracking-wide text-ink">
                            {dish.name}
                          </h3>
                          {isCustom && (
                            <span className="shrink-0 rounded bg-paper-2 px-1.5 py-0.5 text-[9.5px] text-ink-3">
                              改规格
                            </span>
                          )}
                        </div>
                        {customSummary.length > 0 && (
                          <p className="mt-0.5 line-clamp-1 text-[10.5px] leading-tight text-accent">
                            {customSummary.join(" · ")}
                          </p>
                        )}
                        {item.addedBy && (
                          <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-ink-3">
                            <Avatar name={formatPersonName(item.addedBy)} />
                            <span className="truncate">{formatPersonName(item.addedBy)}</span>
                          </p>
                        )}
                      </div>
                      {selecting ? (
                        <span className="text-[12px] text-ink-3 tabular-nums">
                          ×{item.qty}
                        </span>
                      ) : (
                        <AddButton dish={dish} confirmRemove />
                      )}
                    </div>
                  </SwipeRow>
                );
              })}
            </div>
          </section>
        ))}
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
                  title: `删除选中的 ${picked.length} 道菜？`,
                  desc: names.length > 40 ? `${names.slice(0, 40)}…` : names,
                  confirmText: "删除",
                  danger: true,
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
        ) : (
          <button
            type="button"
            onClick={openOrderConfirm}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-[14px] tracking-wide text-white transition active:scale-[0.99]"
          >
            <CookingPot size={17} weight="regular" />
            下单
          </button>
        )}
      </div>

      {/* 下单确认抽屉 */}
      <OrderConfirmSheet
        open={orderSheetOpen}
        onOpenChange={setOrderSheetOpen}
        onPlaced={(order) => {
          setLastOrder(order);
        }}
      />
    </div>
  );
}

