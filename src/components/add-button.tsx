"use client";

import { Minus, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Dish } from "@/data/types";
import { useCart } from "@/lib/store";
import { useConfirm } from "@/lib/confirm-store";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/utils";
import { useGuard } from "@/lib/use-guard";

export function AddButton({
  dish,
  className,
  confirmRemove,
}: {
  dish: Dish;
  className?: string;
  /** 点菜单里减到 0 时弹确认 */
  confirmRemove?: boolean;
}) {
  const confirm = useConfirm((s) => s.confirm);
  const qty = useCart((s) => s.items.find((i) => i.dishId === dish.id)?.qty ?? 0);
  const locked = useCart((s) => s.locked);
  const add = useCart((s) => s.add);
  const setQty = useCart((s) => s.setQty);

  // 连点加减是正常操作，只挡住 150ms 内的重复触发（幽灵点击 / 手抖）
  const onAdd = useGuard((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) {
      toast("这一餐已经定了，想改先点「重新编辑」");
      return;
    }
    haptic();
    add(dish.id);
    if (qty === 0) toast(`已加入 · ${dish.name}`);
  }, 150);

  const onSub = useGuard((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) return;
    if (confirmRemove && qty === 1) {
      confirm({
        title: `从点菜单移除\n「${dish.name}」？`,
        confirmText: "移除",
        onConfirm: () => setQty(dish.id, 0),
      });
      return;
    }
    haptic(8);
    setQty(dish.id, qty - 1);
  }, 150);

  if (qty === 0) {
    return (
      <button
        type="button"
        aria-label={`加入${dish.name}`}
        onClick={onAdd}
        className={cn(
          "grid size-[26px] place-items-center rounded-full border border-line-2 bg-card text-ink-2 transition active:scale-90",
          className,
        )}
      >
        <Plus size={14} weight="bold" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-1 py-0.5",
        className,
      )}
    >
      <button
        type="button"
        aria-label="减少"
        onClick={onSub}
        className="grid size-[20px] place-items-center rounded-full text-accent transition active:scale-90"
      >
        <Minus size={12} weight="bold" />
      </button>
      <span className="min-w-[10px] text-center text-[12px] font-medium text-accent tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        aria-label="增加"
        onClick={onAdd}
        className="grid size-[20px] place-items-center rounded-full text-accent transition active:scale-90"
      >
        <Plus size={12} weight="bold" />
      </button>
    </div>
  );
}
