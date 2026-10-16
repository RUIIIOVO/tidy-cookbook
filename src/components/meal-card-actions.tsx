"use client";

import { PencilSimple, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useConfirm } from "@/lib/confirm-store";
import type { Meal } from "@/lib/protocol";
import { haptic } from "@/lib/utils";
import { openMealEdit } from "./meal-edit-sheet";

/**
 * 订单卡片右上角的「编辑 / 删除」两个图标，订单页和备菜页共用。
 * 删除前弹确认；onDelete 由调用方决定怎么删（订单页要顺带更新本地列表）。
 */
export function MealCardActions({
  meal,
  title,
  onDelete,
}: {
  meal: Meal;
  title: string;
  onDelete: () => Promise<boolean>;
}) {
  const confirm = useConfirm((s) => s.confirm);
  const btn =
    "grid size-8 shrink-0 place-items-center rounded-full text-ink-3 transition active:scale-90 active:bg-paper-2";

  return (
    <span className="-mr-2 flex shrink-0 items-center">
      <button
        type="button"
        aria-label={`编辑 ${title}`}
        onClick={() => {
          haptic(6);
          openMealEdit(meal);
        }}
        className={btn}
      >
        <PencilSimple size={16} />
      </button>
      <button
        type="button"
        aria-label={`删除 ${title}`}
        onClick={() =>
          confirm({
            title: `删除\n${title}？`,
            desc: "删除后无法恢复",
            confirmText: "删除",
            onConfirm: () => {
              void onDelete().then((ok) => {
                toast(ok ? "订单已删除" : "删除失败，请稍后重试");
              });
            },
          })
        }
        className={btn}
      >
        <Trash size={16} />
      </button>
    </span>
  );
}
