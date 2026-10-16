"use client";

import { useId, useState } from "react";
import { Drawer } from "vaul";
import { CaretDown } from "@phosphor-icons/react";
import { toast } from "sonner";
import { getDish } from "@/data/dishes";
import { cn } from "@/lib/utils";
import { DishThumb } from "./dish-thumb";
import {
  dayLabel,
  defaultPick,
  mealKey,
  shortDate,
  slotName,
  type Slot,
} from "@/lib/meal-time";
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
        dish: getDish(i.dishId),
      }));
  });

  // reqId 每次面板打开生成一次，失败重试复用同一个
  const [reqId] = useState(() => newReqId());

  // 已有订单的 'YYYY-MM-DD:slot' → 菜数
  const taken = new Map(meals.map((m) => [mealKey(m.mealDate, m.slot), m.items.length]));

  // 默认选中：defaultPick(Date.now(), today, taken)
  const [pick, setPick] = useState<MealPick>(() =>
    defaultPick(Date.now(), today, new Set(taken.keys())),
  );

  const [loading, setLoading] = useState(false);

  const totalLines = snapshot.length;
  const totalQty = snapshot.reduce((sum, item) => sum + item.qty, 0);

  // 摘要行：最多叠 3 张小图 + 前两道菜名；点开看完整清单
  const [expanded, setExpanded] = useState(false);
  const thumbs = snapshot.filter((i) => i.dish).slice(0, 3);
  const names = snapshot.slice(0, 2).map((i) => i.name).join("、");
  const summary = totalLines > 2 ? `${names} 等 ${totalLines} 道` : names;

  // 按钮上的选择结果：「明天午餐」
  const pickText = `${dayLabel(pick.date, today) ?? shortDate(pick.date)}${slotName(pick.slot)}`;

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
        toast(`已下单 · ${pickText}`);
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
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] max-w-[520px] flex-col rounded-t-2xl border-t border-line bg-paper outline-none"
        >
          <div className="shrink-0 cursor-grab pt-3 pb-1 active:cursor-grabbing">
            <div className="mx-auto h-1 w-10 rounded-full bg-line-2 transition-colors hover:bg-ink-3" />
          </div>

          {/* 标题：没有关闭按钮，下滑或点遮罩关闭 */}
          <div className="px-5 pt-2 pb-3">
            <Drawer.Title className="font-display text-[18px] tracking-wide text-ink">
              选择用餐时间
            </Drawer.Title>
          </div>

          {/* 内容区 */}
          <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
            <MealPicker today={today} value={pick} onChange={setPick} taken={taken} />

            {/* 菜品摘要：一行，点开看完整清单 */}
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 flex w-full items-center gap-3 rounded-card py-1.5 text-left transition active:opacity-60"
            >
              <span className="flex shrink-0 items-center pl-0.5">
                {thumbs.map((it, idx) => (
                  <span
                    key={it.dishId}
                    className={cn("rounded-lg ring-2 ring-paper", idx > 0 && "-ml-2.5")}
                    style={{ zIndex: thumbs.length - idx }}
                  >
                    <DishThumb dish={it.dish!} className="size-9 rounded-lg" sizes="36px" />
                  </span>
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{summary}</span>
              <CaretDown
                size={14}
                className={cn("shrink-0 text-ink-3 transition-transform", expanded && "rotate-180")}
              />
            </button>

            {/* 完整清单：一行一道菜 */}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out",
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="min-h-0 overflow-hidden" inert={!expanded}>
                <div className="mt-2 rounded-card border border-line bg-card px-3.5 pt-1 pb-2.5">
                  <ul>
                    {snapshot.map((it) => (
                      <li key={it.dishId} className="flex items-center gap-2.5 py-1.5">
                        {it.dish ? (
                          <DishThumb
                            dish={it.dish}
                            className="size-8 shrink-0 rounded-md"
                            sizes="32px"
                          />
                        ) : (
                          <span className="size-8 shrink-0 rounded-md bg-paper-2" />
                        )}
                        <span className="min-w-0 truncate font-display text-[14px] tracking-wide text-ink">
                          {it.name}
                        </span>
                        {/* 点线引导到份数 */}
                        <span
                          aria-hidden
                          className="mx-1 h-px min-w-4 flex-1 border-b border-dotted border-line-2"
                        />
                        <span className="shrink-0 text-[12px] text-ink-2 tabular-nums">
                          ×{it.qty}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 flex justify-end pt-2 text-[11px] text-ink-3">
                    合计 <span className="mx-0.5 tabular-nums text-ink-2">{totalLines}</span> 道 ·{" "}
                    <span className="mx-0.5 tabular-nums text-ink-2">{totalQty}</span> 份
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 底部下单按钮：弹窗里唯一的实心强调色 */}
          <div
            className="border-t border-line bg-paper/95 px-5 pt-3 backdrop-blur-md"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.875rem)" }}
          >
            <button
              type="button"
              disabled={!isOnline || loading || totalLines === 0}
              onClick={handleConfirm}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-[15px] font-medium tracking-wide text-white transition active:scale-[0.99] disabled:opacity-40"
            >
              {!isOnline ? "离线中" : loading ? "正在下单…" : `下单 · ${pickText}`}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
