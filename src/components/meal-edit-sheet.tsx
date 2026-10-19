"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import {
  ArrowClockwise,
  ArrowsMerge,
  Check,
  PencilSimple,
  Plus,
  SpinnerGap,
  Trash,
  Warning,
  WifiSlash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { create } from "zustand";
import { getDish } from "@/data/dishes";
import { canDelete, useAuth } from "@/lib/auth-store";
import { useConfirm } from "@/lib/confirm-store";
import { useHistory } from "@/lib/history-store";
import { deleteMeal, newReqId, saveMeal } from "@/lib/meal-actions";
import { dayLabel, mealKey, mealTitle, shortDate, slotName, type Slot } from "@/lib/meal-time";
import type { Meal } from "@/lib/protocol";
import { useCart } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { ui } from "@/lib/ui";
import { cn, haptic } from "@/lib/utils";
import { DishThumb } from "./dish-thumb";
import { useBackClose } from "@/lib/use-back-close";
import { DishPickerSheet, QtyStepper, type DraftItem } from "./dish-picker-sheet";
import { MealTimeFields, type MealTime } from "./meal-time-fields";
import { SwipeRow } from "./swipe-row";

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
  // 过去的日期只有 owner 能选
  const isOwner = useAuth((s) => canDelete(s.me));

  const [base, setBase] = useState<Base>(() => toBase(meal));
  const [draft, setDraft] = useState<Draft>(() => toDraft(toBase(meal)));
  // 打开时生成一次；草稿一改就换新的（没改过的重试复用同一个，服务端会去重）
  const [reqId, setReqId] = useState(newReqId);
  const [openToday] = useState(() => useCart.getState().today);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // 菜品列表：左滑打开的那一行 / 批量管理（多选）
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const maxDrag = useRef(0);

  const edit = useCallback((fn: (d: Draft) => Draft) => {
    setDraft(fn);
    setReqId(newReqId());
  }, []);

  const dirty = useMemo(() => isChanged(base, draft), [base, draft]);
  const empty = draft.items.length === 0;
  // 菜删光了就没有可管理的了
  const selecting = managing && !empty;

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
    setPicked([]);
    setSwipedId(null);
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
  // 只有改了日期或用餐才会合并（服务端同样规则）；旧数据同一天可能本来就有两条晚餐，原地保存不提示
  const moved = draft.date !== base.date || draft.slot !== base.slot;
  const target = moved ? mergeTarget.get(mealKey(draft.date, draft.slot)) : undefined;

  // 合并提示：「明天晚餐已经有一单，保存后会合并」
  const mergeHint = `${dayLabel(draft.date, today) ?? shortDate(draft.date)}${slotName(draft.slot)}已经有一单，保存后会合并`;

  const title = mealTitle(draft.date, draft.slot, today);
  const originTitle = mealTitle(base.date, base.slot, today);

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
  const setQty = useCallback(
    (dishId: string, qty: number) =>
      edit((d) => {
        if (qty <= 0) return { ...d, items: d.items.filter((i) => i.dishId !== dishId) };
        const has = d.items.some((i) => i.dishId === dishId);
        return {
          ...d,
          items: has
            ? d.items.map((i) => (i.dishId === dishId ? { ...i, qty } : i))
            : [...d.items, { dishId, qty }],
        };
      }),
    [edit],
  );

  const removeMany = (ids: string[]) => {
    const gone = new Set(ids);
    edit((d) => ({ ...d, items: d.items.filter((i) => !gone.has(i.dishId)) }));
  };

  // 步进器减到 0 要确认；其余直接改
  const stepTo = (dishId: string, name: string, n: number) => {
    if (n > 0) {
      setQty(dishId, n);
      return;
    }
    confirm({
      title: `从订单中移除\n「${name}」？`,
      confirmText: "去掉",
      onConfirm: () => setQty(dishId, 0),
    });
  };

  const toggleManage = () => {
    haptic(6);
    setManaging((v) => !v);
    setPicked([]);
    setSwipedId(null);
  };

  const askRemovePicked = () => {
    if (picked.length === 0) return;
    const names = picked
      .map((id) => getDish(id)?.name ?? "已下架的菜")
      .join("、");
    confirm({
      title: `移除选中的 ${picked.length} 道菜？`,
      desc: names.length > 40 ? `${names.slice(0, 40)}…` : names,
      confirmText: "删除",
      danger: true,
      onConfirm: () => {
        removeMany(picked);
        setPicked([]);
        setManaging(false);
      },
    });
  };

  const pickTime = (v: MealTime) => edit((d) => ({ ...d, date: v.date, slot: v.slot }));

  // ── 保存 / 删除 ──
  const doDelete = async () => {
    setSaving(true);
    const ack = await deleteMeal({ mealId: base.id, date: base.date });
    setSaving(false);
    if (ack.ok || ack.code === "not_found") {
      toast(ack.ok ? "订单已删除" : "订单已不存在");
      close();
    } else {
      toast(ack.reason ?? "删除失败，请稍后重试");
    }
  };

  const askDelete = () => {
    if (saving || !online) return;
    confirm({
      title: `删除\n${originTitle}？`,
      desc: "删除后无法恢复",
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
      toast("已保存");
      close();
    } else if (ack.code === "conflict") {
      toast("订单已被修改，已刷新");
      close();
    } else {
      toast(ack.reason ?? "保存失败，请稍后重试");
    }
  };

  const saveDisabled = saving || !online || stale || gone || (!empty && !dirty);

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
          // 加菜页铺在抽屉内部（见 DishPickerSheet），打开时把抽屉撑到最高
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-[520px] flex-col rounded-t-2xl border-t border-line bg-paper outline-none",
            pickerOpen && "h-[92dvh]",
          )}
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
              <Drawer.Description className="sr-only">
                {meal.orderedBy ? `${meal.orderedBy} 下单，修改后请保存` : "修改后请保存"}
              </Drawer.Description>
            </div>
          </div>

          <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pt-4 pb-5">
            {/* 别人改了 / 删了这单 */}
            {gone ? (
              <div className="flex items-start gap-2 rounded-card border border-chili/25 bg-chili-soft px-3 py-2.5 text-[12px] leading-relaxed text-chili">
                <Warning size={15} weight="bold" className="mt-0.5 shrink-0" />
                <span>订单已被删除，无法保存</span>
              </div>
            ) : (
              stale && (
                <div className="flex items-center gap-2 rounded-card border border-caramel/25 bg-caramel-soft px-3 py-2.5 text-[12px] text-caramel">
                  <Warning size={15} weight="bold" className="shrink-0" />
                  <span className="flex-1">订单已被修改</span>
                  <button
                    type="button"
                    onClick={reload}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-caramel px-2.5 py-1 text-[11.5px] font-medium text-white transition active:scale-95"
                  >
                    <ArrowClockwise size={12} weight="bold" />
                    刷新
                  </button>
                </div>
              )
            )}

            {/* 日期 / 用餐 */}
            <div>
              <MealTimeFields
                today={today}
                isOwner={isOwner}
                value={{ date: draft.date, slot: draft.slot }}
                base={{ date: base.date, slot: base.slot }}
                taken={taken}
                onChange={pickTime}
                disabled={saving}
              />
              {target && (
                <p className="mt-2 flex items-start gap-1.5 px-1 text-[11.5px] leading-relaxed text-brine">
                  <ArrowsMerge size={14} weight="bold" className="mt-0.5 shrink-0" />
                  <span>{mergeHint}</span>
                </p>
              )}
            </div>

            {/* 菜 */}
            <section>
              <div className="mb-2.5 flex items-center gap-2">
                <h3 className="font-display text-[15px] tracking-[0.2em] text-ink">菜品</h3>
                <span className="text-[11px] text-ink-3 tabular-nums">
                  {draft.items.length} 道
                </span>
                <span className="h-px flex-1 bg-line" />
                {!empty && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={toggleManage}
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
                )}
              </div>

              {empty ? (
                <p className="rounded-card border border-dashed border-line-2 py-6 text-center text-[12px] text-ink-3">
                  菜品已全部移除，保存后将删除订单
                </p>
              ) : (
                <div data-vaul-no-drag className="space-y-2">
                  {draft.items.map((it) => {
                    const dish = getDish(it.dishId);
                    const name = dish?.name ?? "这道菜已下架";
                    const on = picked.includes(it.dishId);
                    return (
                      <SwipeRow
                        key={it.dishId}
                        open={swipedId === it.dishId}
                        onOpenChange={(o) => setSwipedId(o ? it.dishId : null)}
                        disabled={selecting || saving}
                        onDelete={() => {
                          haptic(12);
                          setSwipedId(null);
                          setQty(it.dishId, 0);
                        }}
                      >
                        <div
                          onClick={() => {
                            if (!selecting) return;
                            haptic(6);
                            setPicked((p) =>
                              p.includes(it.dishId)
                                ? p.filter((x) => x !== it.dishId)
                                : [...p, it.dishId],
                            );
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
                          {dish ? (
                            <DishThumb
                              dish={dish}
                              className="size-[46px] shrink-0 rounded-lg"
                              sizes="46px"
                            />
                          ) : (
                            <span className="size-[46px] shrink-0 rounded-lg bg-paper-2" />
                          )}
                          <h4 className="min-w-0 flex-1 truncate font-display text-[15px] tracking-wide text-ink">
                            {name}
                          </h4>
                          {selecting ? (
                            <span className="text-[12px] text-ink-3 tabular-nums">×{it.qty}</span>
                          ) : (
                            <QtyStepper
                              qty={it.qty}
                              name={name}
                              disabled={saving}
                              onChange={(n) => stepTo(it.dishId, name, n)}
                            />
                          )}
                        </div>
                      </SwipeRow>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  haptic(6);
                  setSwipedId(null);
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
            {selecting ? (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setPicked(
                      picked.length === draft.items.length ? [] : draft.items.map((i) => i.dishId),
                    )
                  }
                  className="h-12 shrink-0 rounded-full border border-line bg-card px-5 text-[14px] text-ink-2"
                >
                  {picked.length === draft.items.length ? "取消全选" : "全选"}
                </button>
                <button
                  type="button"
                  disabled={picked.length === 0}
                  onClick={askRemovePicked}
                  className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-chili text-[15px] text-white disabled:opacity-40"
                >
                  <Trash size={14} weight="regular" />
                  删除 {picked.length > 0 && <span className="tabular-nums">{picked.length}</span>}
                </button>
              </div>
            ) : (
              <>
                {!online && (
                  <p className="mb-2 flex items-center justify-center gap-1.5 text-[11.5px] text-chili">
                    <WifiSlash size={13} />
                    离线中，联网后才能保存
                  </p>
                )}
                {/* 删除在订单卡片上（编辑图标旁），这里只留保存；菜删光时保存即删除 */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={saveDisabled}
                    onClick={() => void doSave()}
                    className={cn(ui.primary, empty && "bg-chili")}
                  >
                    {saving && <SpinnerGap size={15} className="animate-spin" />}
                    {saving ? "处理中…" : empty ? "删除订单" : "保存"}
                  </button>
                </div>
              </>
            )}
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
