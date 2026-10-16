"use client";

import { useId, useState } from "react";
import { Drawer } from "vaul";
import { Sparkle, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { getDish } from "@/data/dishes";
import { defaultPick, mealKey, mealTitle, type Slot } from "@/lib/meal-time";
import { newReqId, placeOrder } from "@/lib/meal-actions";
import { useCart } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { haptic } from "@/lib/utils";
import { useGuard } from "@/lib/use-guard";
import { MealPicker, type MealPick } from "./meal-picker";

export type OrderConfirmSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlaced: (order: { date: string; slot: Slot; count: number }) => void;
};

export function OrderConfirmSheet({
  open,
  onOpenChange,
  onPlaced,
}: OrderConfirmSheetProps) {
  const reqSeed = useId();
  const [seq, setSeq] = useState(0);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && !open) {
      setSeq((s) => s + 1);
    }
    onOpenChange(nextOpen);
  };

  if (!open && seq === 0) return null;

  return (
    <OrderConfirmSheetContent
      key={`${reqSeed}-${seq}`}
      open={open}
      onOpenChange={handleOpenChange}
      onPlaced={onPlaced}
    />
  );
}

function OrderConfirmSheetContent({
  open,
  onOpenChange,
  onPlaced,
}: OrderConfirmSheetProps) {
  const today = useCart((s) => s.today);
  const meals = useCart((s) => s.meals);
  const syncStatus = useSyncStatus();

  // 快照：面板打开时刻的点菜单 items，不受外界修改影响
  const [snapshot] = useState(() => {
    const rawItems = useCart.getState().items;
    return rawItems
      .filter((i) => i.qty > 0)
      .map((i) => ({
        dishId: i.dishId,
        qty: i.qty,
        name: getDish(i.dishId)?.name ?? i.dishId,
      }));
  });

  // reqId 每次面板打开生成一次，失败重试复用同一个
  const [reqId] = useState(() => newReqId());

  // taken 集合：'YYYY-MM-DD:slot'
  const taken = new Set(meals.map((m) => mealKey(m.mealDate, m.slot)));

  // 默认选中：defaultPick(Date.now(), today, taken)
  const [pick, setPick] = useState<MealPick>(() =>
    defaultPick(Date.now(), today, taken),
  );

  const [loading, setLoading] = useState(false);

  const totalLines = snapshot.length;
  const totalQty = snapshot.reduce((sum, item) => sum + item.qty, 0);

  // 检查所选餐是否已有订单
  const existingMeal = meals.find(
    (m) => m.mealDate === pick.date && m.slot === pick.slot,
  );
  const existingCount =
    existingMeal?.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;

  // 是否早于 today（补录）
  const isPast = pick.date < today;

  const isOnline = syncStatus === "online";

  const close = () => {
    if (loading) return;
    onOpenChange(false);
  };

  const handleConfirm = useGuard(async () => {
    if (loading || !isOnline || totalLines === 0) return;

    setLoading(true);
    try {
      const items = snapshot.map(({ dishId, qty }) => ({ dishId, qty }));
      const ack = await placeOrder({
        reqId,
        date: pick.date,
        slot: pick.slot,
        items,
      });

      if (ack.ok) {
        haptic(25);
        const title = mealTitle(pick.date, pick.slot, today);
        toast(`下单了 · ${title}`);
        onOpenChange(false);
        onPlaced({
          date: pick.date,
          slot: pick.slot,
          count: totalLines,
        });
      } else {
        toast(ack.reason ?? "下单失败，请重试");
      }
    } catch {
      toast("下单请求出现异常，请重试");
    } finally {
      setLoading(false);
    }
  }, 400);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !loading) close();
      }}
      repositionInputs={false}
      scrollLockTimeout={0}
      closeThreshold={0.2}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/35" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] max-w-[520px] flex-col rounded-t-2xl border-t border-line bg-paper outline-none">
          <div className="shrink-0 pt-3 pb-2 cursor-grab active:cursor-grabbing">
            <div className="mx-auto h-1 w-10 rounded-full bg-line-2 transition-colors hover:bg-ink-3" />
          </div>

          {/* 顶栏 */}
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div>
              <Drawer.Title className="font-display text-[18px] tracking-wide text-ink">
                这一餐什么时候吃？
              </Drawer.Title>
              <Drawer.Description className="mt-0.5 text-[11px] text-ink-3">
                选好就餐时间，把点好的菜入单
              </Drawer.Description>
            </div>
            <button
              type="button"
              onClick={close}
              disabled={loading}
              className="grid size-7 place-items-center rounded-full bg-paper-2 text-ink-2 transition active:scale-95 disabled:opacity-50"
            >
              <X size={15} />
            </button>
          </div>

          {/* 内容区 */}
          <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pt-4 pb-6">
            {/* 菜名摘要卡片：菜名×份数，最多两行，超出省略 + 合计道数份数 */}
            <div className="rounded-card border border-line bg-card p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium text-ink-3">菜品清单</span>
                <span className="text-[11px] text-ink-3">
                  共 <span className="tabular-nums text-ink-2">{totalLines}</span> 道 ·{" "}
                  <span className="tabular-nums text-ink-2">{totalQty}</span> 份
                </span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-2">
                {snapshot.map((item) => `${item.name} × ${item.qty}`).join("、")}
              </p>
            </div>

            {/* 日期与餐别选择 */}
            <div>
              <MealPicker
                today={today}
                value={pick}
                onChange={setPick}
                taken={taken}
              />
            </div>

            {/* 状态提示文案 */}
            <div className="min-h-[20px] text-[12px] leading-tight">
              {existingMeal && (
                <p className="flex items-center gap-1.5 text-caramel">
                  <Sparkle size={13} weight="fill" />
                  <span>
                    {mealTitle(pick.date, pick.slot, today)} 已有 {existingCount} 道，会合并进去
                  </span>
                </p>
              )}
              {isPast && !existingMeal && (
                <p className="text-ink-3">会补进订单记录</p>
              )}
            </div>
          </div>

          {/* 底部确认按钮 */}
          <div
            className="border-t border-line bg-paper/95 px-5 py-3.5 backdrop-blur-md"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.875rem)" }}
          >
            <button
              type="button"
              disabled={!isOnline || loading || totalLines === 0}
              onClick={handleConfirm}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-[14px] font-medium tracking-wide text-white transition active:scale-[0.99] disabled:opacity-40"
            >
              {!isOnline
                ? "离线中"
                : loading
                  ? "正在下单…"
                  : `确认下单 · ${totalLines} 道`}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
