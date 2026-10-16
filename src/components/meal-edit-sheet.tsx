"use client";

import { useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import {
  ArrowClockwise,
  ArrowsMerge,
  CalendarBlank,
  CaretDown,
  Plus,
  SpinnerGap,
  Warning,
  WifiSlash,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { create } from "zustand";
import { getDish } from "@/data/dishes";
import { canDelete, useAuth } from "@/lib/auth-store";
import { useConfirm } from "@/lib/confirm-store";
import { useHistory } from "@/lib/history-store";
import { deleteMeal, newReqId, saveMeal } from "@/lib/meal-actions";
import { mealKey, mealTitle, pickableDays, type Slot } from "@/lib/meal-time";
import type { Meal } from "@/lib/protocol";
import { useCart } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { cn, formatPersonName, haptic } from "@/lib/utils";
import { DishThumb } from "./dish-thumb";
import { DishPickerSheet, QtyStepper, useBackClose, type DraftItem } from "./dish-picker-sheet";
import { MealPicker, type MealPick } from "./meal-picker";

// ── 全局开关：任何地方 openMealEdit(meal) 就能打开编辑面板 ──────────────────
type EditStore = {
  // 收起时保留 meal，让面板内容撑到退场动画结束；动画结束后才清空
  meal: Meal | null;
  visible: boolean;
  // 每次打开递增，用作 key 让草稿按最新订单重新初始化
  seq: number;
  open: (meal: Meal) => void;
  close: () => void;
  clear: () => void;
};

export const useMealEdit = create<EditStore>((set) => ({
  meal: null,
  visible: false,
  seq: 0,
  open: (meal) => set((s) => ({ meal, visible: true, seq: s.seq + 1 })),
  close: () => set({ visible: false }),
  clear: () => set({ meal: null }),
}));

/**
 * 打开订单编辑面板。已吃订单（就餐日期早于今天）只有 owner 能改，其他人调用会被拦下。
 * 返回是否真的打开了。
 */
export function openMealEdit(meal: Meal): boolean {
  const today = useCart.getState().today;
  if (meal.mealDate < today && !canDelete(useAuth.getState().me)) {
    toast("以前的订单只有 rui 和 hui 能改");
    return false;
  }
  useMealEdit.getState().open(meal);
  return true;
}

/** 全局只需要挂一个（挂在 tabs-host，备菜页和订单页的「修改」共用） */
export function MealEditSheet() {
  const meal = useMealEdit((s) => s.meal);
  const visible = useMealEdit((s) => s.visible);
  const seq = useMealEdit((s) => s.seq);
  const close = useMealEdit((s) => s.close);
  const clear = useMealEdit((s) => s.clear);

  if (!meal) return null;
  return <EditContent key={seq} meal={meal} visible={visible} close={close} clear={clear} />;
}

// ── 草稿 ────────────────────────────────────────────────────────────────────
type Base = { id: string; date: string; slot: Slot; rev: number; items: DraftItem[] };
type Draft = { date: string; slot: Slot; items: DraftItem[] };

const toBase = (m: Meal): Base => ({
  id: m.id,
  date: m.mealDate,
  slot: m.slot,
  rev: m.rev,
  items: m.items.map((i) => ({ dishId: i.dishId, qty: i.qty })),
});

const toDraft = (b: Base): Draft => ({
  date: b.date,
  slot: b.slot,
  items: b.items.map((i) => ({ ...i })),
});

/** 草稿和原单是否有差异（菜的顺序不算） */
function isChanged(base: Base, draft: Draft): boolean {
  if (base.date !== draft.date || base.slot !== draft.slot) return true;
  if (base.items.length !== draft.items.length) return true;
  const cur = new Map(draft.items.map((i) => [i.dishId, i.qty]));
  return base.items.some((i) => cur.get(i.dishId) !== i.qty);
}

function EditContent({
  meal,
  visible,
  close,
  clear,
}: {
  meal: Meal;
  visible: boolean;
  close: () => void;
  clear: () => void;
}) {
  const today = useCart((s) => s.today);
  const meals = useCart((s) => s.meals);
  const historyAll = useHistory((s) => s.cache.all.meals);
  const history7d = useHistory((s) => s.cache["7d"].meals);
  const confirm = useConfirm((s) => s.confirm);
  const confirmOpen = useConfirm((s) => !!s.opts);
  const online = useSyncStatus() === "online";

  const [base, setBase] = useState<Base>(() => toBase(meal));
  const [draft, setDraft] = useState<Draft>(() => toDraft(toBase(meal)));
  // 打开时生成一次；草稿一改就换新的（没改过的重试复用同一个，服务端会去重）
  const [reqId, setReqId] = useState(newReqId);
  const [openToday] = useState(() => useCart.getState().today);
  const [saving, setSaving] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const maxDrag = useRef(0);

  const edit = (fn: (d: Draft) => Draft) => {
    setDraft(fn);
    setReqId(newReqId());
  };

  const dirty = useMemo(() => isChanged(base, draft), [base, draft]);
  const empty = draft.items.length === 0;

  // ── 编辑期间订单在服务端被别人改了 / 删了 ──
  const live = meals.find((m) => m.id === base.id);
  const stale = !!live && live.rev !== base.rev;
  const gone = !live && base.date >= openToday && today <= base.date;

  const reload = () => {
    if (!live) return;
    haptic(8);
    const b = toBase(live);
    setBase(b);
    setDraft(toDraft(b));
    setReqId(newReqId());
  };

  // ── 目标餐是否已有另一张订单（待吃的 + 历史页已加载的已吃订单） ──
  const mergeTarget = useMemo(() => {
    const byKey = new Map<string, Meal>();
    for (const m of [...history7d, ...historyAll, ...meals]) {
      if (m.id !== base.id) byKey.set(mealKey(m.mealDate, m.slot), m);
    }
    return byKey;
  }, [history7d, historyAll, meals, base.id]);
  const taken = useMemo(() => new Set(mergeTarget.keys()), [mergeTarget]);
  const target = mergeTarget.get(mealKey(draft.date, draft.slot));

  const days = useMemo(
    () => [...new Set([...pickableDays(today), base.date])].sort(),
    [today, base.date],
  );

  const title = mealTitle(draft.date, draft.slot, today);
  const originTitle = mealTitle(base.date, base.slot, today);
  const total = draft.items.reduce((n, i) => n + i.qty, 0);

  // ── 关闭 ──
  const requestClose = () => {
    // 保存中、或正在弹确认框时不响应（确认框点按会被当成「点了面板外面」）
    if (saving || useConfirm.getState().opts) return;
    if (!dirty) {
      close();
      return;
    }
    confirm({
      title: "放弃修改？",
      desc: "改过的内容不会保存",
      confirmText: "放弃",
      onConfirm: close,
    });
  };
  useBackClose(visible, requestClose);

  // 有改动 / 正在保存时不让 vaul 自己收起，统一走 requestClose 弹确认
  const dismissible = !dirty && !saving && !confirmOpen;

  // ── 草稿操作 ──
  const setQty = (dishId: string, qty: number) =>
    edit((d) => {
      if (qty <= 0) return { ...d, items: d.items.filter((i) => i.dishId !== dishId) };
      const has = d.items.some((i) => i.dishId === dishId);
      return {
        ...d,
        items: has
          ? d.items.map((i) => (i.dishId === dishId ? { ...i, qty } : i))
          : [...d.items, { dishId, qty }],
      };
    });

  const pickTime = (v: MealPick) => edit((d) => ({ ...d, date: v.date, slot: v.slot }));

  // ── 保存 / 删除 ──
  const doDelete = async () => {
    setSaving(true);
    const ack = await deleteMeal({ mealId: base.id, date: base.date });
    setSaving(false);
    if (ack.ok || ack.code === "not_found") {
      toast(ack.ok ? "订单删掉了" : "这单已经没了");
      close();
    } else {
      toast(ack.reason ?? "没删成，稍后再试");
    }
  };

  const askDelete = () => {
    if (saving || !online) return;
    confirm({
      title: `删除 ${originTitle}\n这一单？`,
      desc: "删掉后不能恢复",
      confirmText: "删除",
      onConfirm: () => void doDelete(),
    });
  };

  const doSave = async () => {
    if (saving || !online) return;
    if (empty) {
      askDelete();
      return;
    }
    setSaving(true);
    const ack = await saveMeal({
      reqId,
      mealId: base.id,
      rev: base.rev,
      date: draft.date,
      slot: draft.slot,
      items: draft.items,
      fromDate: base.date,
    });
    setSaving(false);
    if (ack.ok) {
      toast("改好了");
      close();
    } else if (ack.code === "conflict") {
      toast("刚被改过，已刷新");
      close();
    } else {
      toast(ack.reason ?? "没保存成，稍后再试");
    }
  };

  const saveDisabled = saving || !online || stale || gone || (!empty && !dirty);
  const deleteDisabled = saving || !online || gone;

  return (
    <Drawer.Root
      open={visible}
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
      onAnimationEnd={(o) => {
        if (!o) clear();
      }}
      dismissible={dismissible}
      onDrag={(_, p) => {
        maxDrag.current = Math.max(maxDrag.current, p);
      }}
      onRelease={() => {
        // 有改动时 vaul 不会收起；下拉超过一定幅度就当作想关，弹确认
        if (!dismissible && maxDrag.current > 0.25) requestClose();
        maxDrag.current = 0;
      }}
      repositionInputs={false}
      scrollLockTimeout={0}
      closeThreshold={0.2}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/35" onClick={requestClose} />
        <Drawer.Content
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            requestClose();
          }}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-[520px] flex-col rounded-t-2xl border-t border-line bg-paper outline-none"
        >
          <div className="shrink-0 cursor-grab pt-3 pb-2 active:cursor-grabbing">
            <div className="mx-auto h-1 w-10 rounded-full bg-line-2" />
          </div>

          {/* 顶栏 */}
          <div className="flex shrink-0 items-center justify-between border-b border-line px-5 pb-3">
            <div className="min-w-0">
              <Drawer.Title className="font-display text-[18px] tracking-wide text-ink">
                修改订单
              </Drawer.Title>
              <Drawer.Description className="mt-0.5 truncate text-[11px] text-ink-3">
                {meal.orderedBy ? `${meal.orderedBy} 下的单` : "改完记得点保存"}
              </Drawer.Description>
            </div>
            <button
              type="button"
              aria-label="关闭"
              onClick={requestClose}
              className="grid size-7 shrink-0 place-items-center rounded-full bg-paper-2 text-ink-2"
            >
              <X size={15} />
            </button>
          </div>

          <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pt-4 pb-5">
            {/* 别人改了 / 删了这单 */}
            {gone ? (
              <div className="flex items-start gap-2 rounded-card border border-chili/25 bg-chili-soft px-3 py-2.5 text-[12px] leading-relaxed text-chili">
                <Warning size={15} weight="bold" className="mt-0.5 shrink-0" />
                <span>这单刚被删掉了，不能再保存</span>
              </div>
            ) : (
              stale && (
                <div className="flex items-center gap-2 rounded-card border border-caramel/25 bg-caramel-soft px-3 py-2.5 text-[12px] text-caramel">
                  <Warning size={15} weight="bold" className="shrink-0" />
                  <span className="flex-1">这单刚被改过</span>
                  <button
                    type="button"
                    onClick={reload}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-caramel px-2.5 py-1 text-[11.5px] font-medium text-white transition active:scale-95"
                  >
                    <ArrowClockwise size={12} weight="bold" />
                    重新载入
                  </button>
                </div>
              )
            )}

            {/* 时间 */}
            <section>
              <button
                type="button"
                aria-expanded={timeOpen}
                onClick={() => {
                  haptic(6);
                  setTimeOpen((v) => !v);
                }}
                className="flex w-full items-center gap-2.5 rounded-card border border-line bg-card px-3.5 py-3 text-left transition active:bg-paper"
              >
                <CalendarBlank size={17} className="shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[16px] tracking-wide text-ink">
                    {title}
                  </span>
                  {title !== originTitle && (
                    <span className="mt-0.5 block text-[10.5px] text-ink-3">原来是 {originTitle}</span>
                  )}
                </span>
                <span className="shrink-0 text-[11.5px] text-ink-3">改时间</span>
                <CaretDown
                  size={12}
                  className={cn("shrink-0 text-ink-3 transition-transform", timeOpen && "rotate-180")}
                />
              </button>
              {timeOpen && (
                <MealPicker
                  today={today}
                  days={days}
                  taken={taken}
                  value={{ date: draft.date, slot: draft.slot }}
                  onChange={pickTime}
                  className="mt-3"
                />
              )}
              {target && (
                <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-brine">
                  <ArrowsMerge size={14} weight="bold" className="mt-0.5 shrink-0" />
                  <span>
                    这一餐已经有一单（{target.items.length} 道菜
                    {target.orderedBy && `，${formatPersonName(target.orderedBy)} 下的单`}），保存后会合并成一单
                  </span>
                </p>
              )}
            </section>

            {/* 菜 */}
            <section>
              <div className="mb-2.5 flex items-baseline gap-2">
                <h3 className="font-display text-[15px] tracking-[0.2em] text-ink">菜品</h3>
                <span className="text-[10px] text-ink-3 tabular-nums">
                  {draft.items.length} 道 · {total} 份
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>

              {empty ? (
                <p className="rounded-card border border-dashed border-line-2 py-6 text-center text-[12px] text-ink-3">
                  菜都删光了，保存就会删掉这一单
                </p>
              ) : (
                <ul className="space-y-2">
                  {draft.items.map((it) => {
                    const dish = getDish(it.dishId);
                    const name = dish?.name ?? "这道菜已下架";
                    return (
                      <li
                        key={it.dishId}
                        className="flex items-center gap-3 rounded-card border border-line bg-card p-2"
                      >
                        {dish ? (
                          <DishThumb dish={dish} className="size-11 shrink-0 rounded-[10px]" sizes="44px" />
                        ) : (
                          <span className="size-11 shrink-0 rounded-[10px] bg-paper-2" />
                        )}
                        <p className="min-w-0 flex-1 truncate font-display text-[15px] tracking-wide text-ink">
                          {name}
                        </p>
                        <QtyStepper
                          qty={it.qty}
                          name={name}
                          disabled={saving}
                          onChange={(n) => setQty(it.dishId, n)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  haptic(6);
                  setPickerOpen(true);
                }}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-card border border-dashed border-line-2 py-3 text-[13px] text-ink-2 transition active:bg-paper disabled:opacity-50"
              >
                <Plus size={14} weight="bold" />
                加菜
              </button>
            </section>
          </div>

          {/* 底栏 */}
          <div className="shrink-0 border-t border-line bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {!online && (
              <p className="mb-2 flex items-center justify-center gap-1.5 text-[11.5px] text-chili">
                <WifiSlash size={13} />
                离线中，联网后才能保存
              </p>
            )}
            <div className="flex gap-3">
              {!empty && (
                <button
                  type="button"
                  disabled={deleteDisabled}
                  onClick={askDelete}
                  className="shrink-0 rounded-full border border-chili/30 bg-card px-5 py-3 text-[14px] font-medium tracking-wider text-chili transition active:scale-[0.98] disabled:opacity-40"
                >
                  删除订单
                </button>
              )}
              <button
                type="button"
                disabled={saveDisabled}
                onClick={() => void doSave()}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-[14px] font-medium tracking-wider text-white transition active:scale-[0.99] disabled:opacity-40",
                  empty ? "bg-chili" : "bg-accent",
                )}
              >
                {saving && <SpinnerGap size={15} className="animate-spin" />}
                {saving ? "处理中…" : empty ? "删除订单" : "保存修改"}
              </button>
            </div>
          </div>

          <DishPickerSheet
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            title={title}
            items={draft.items}
            onSetQty={setQty}
          />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
