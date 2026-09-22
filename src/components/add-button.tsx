"use client";

import { Minus, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Dish } from "@/data/types";
import { useCart } from "@/lib/store";
import { useConfirm } from "./confirm-dialog";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/utils";

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

  const onAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) {
      toast("点菜单已锁定，先解锁再加菜");
      return;
    }
    haptic();
    add(dish.id);
    if (qty === 0) toast(`已加入 · ${dish.name}`);
  };

  const onSub = (e: React.MouseEvent) => {
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
  };

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
        "flex items-center gap-1.5 rounded-full border border-chili/30 bg-chili-soft px-1 py-0.5",
        className,
      )}
    >
      <button
        type="button"
        aria-label="减少"
        onClick={onSub}
        className="grid size-[20px] place-items-center rounded-full text-chili transition active:scale-90"
      >
        <Minus size={12} weight="bold" />
      </button>
      <span className="min-w-[10px] text-center text-[12px] font-medium text-chili tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        aria-label="增加"
        onClick={onAdd}
        className="grid size-[20px] place-items-center rounded-full text-chili transition active:scale-90"
      >
        <Plus size={12} weight="bold" />
      </button>
    </div>
  );
}
