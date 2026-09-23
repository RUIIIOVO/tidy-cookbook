"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowCounterClockwise, SignOut, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { getDish } from "@/data/dishes";
import { canDelete, useAuth } from "@/lib/auth-store";
import { useConfirm } from "@/lib/confirm-store";
import { useHistory, type Meal } from "@/lib/history-store";
import { useCart } from "@/lib/store";
import { cn, haptic } from "@/lib/utils";
import { DishThumb } from "./dish-thumb";

export function HistoryView() {
  const me = useAuth((s) => s.me);
  const doLogout = useAuth((s) => s.logout);
  const meals = useHistory((s) => s.meals);
  const loading = useHistory((s) => s.loading);
  const error = useHistory((s) => s.error);
  const load = useHistory((s) => s.load);
  const confirm = useConfirm((s) => s.confirm);
  const locked = useCart((s) => s.locked);

  useEffect(() => {
    void load();
  }, [load]);

  // 锁单会在服务端归档出一条新记录，此时重拉一次
  useEffect(() => {
    if (locked) void load();
  }, [locked, load]);

  return (
    <div className="px-4 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] tracking-wider text-ink">历史订单</h1>
          <p className="mt-1 text-[11px] text-ink-3">
            {me ? `${me.displayName}· ${me.role === "owner" ? "主人" : "客人"}` : ""}
            {meals.length > 0 && ` · 共 ${meals.length} 餐`}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            confirm({
              title: "退出登录？",
              confirmText: "退出",
              onConfirm: () => void doLogout(),
            })
          }
          className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1.5 text-[11px] text-ink-2 transition active:scale-95"
        >
          <SignOut size={12} weight="bold" />
          退出
        </button>
      </div>

      {loading && meals.length === 0 && <Placeholder text="读取中…" />}
      {error && !loading && <Placeholder text={error} retry={load} />}
      {!loading && !error && meals.length === 0 && (
        <Placeholder text="还没有记录" hint="锁单后会自动归档到这里" />
      )}

      <div className="mt-4 flex flex-col gap-3 pb-6">
        {meals.map((m) => (
          <MealCard key={m.id} meal={m} canDelete={canDelete(me)} />
        ))}
      </div>
    </div>
  );
}

function MealCard({ meal, canDelete: allowed }: { meal: Meal; canDelete: boolean }) {
  const removeMeal = useHistory((s) => s.remove);
  const confirm = useConfirm((s) => s.confirm);
  const add = useCart((s) => s.add);
  const locked = useCart((s) => s.locked);

  const rows = meal.items
    .map((i) => ({ i, dish: getDish(i.dishId) }))
    .filter((r): r is { i: typeof r.i; dish: NonNullable<typeof r.dish> } => !!r.dish);

  const total = meal.items.reduce((n, i) => n + i.qty, 0);

  const again = () => {
    if (locked) {
      toast("当前这一餐已经定了，想改先点「重新编辑」");
      return;
    }
    haptic();
    for (const { i } of rows) add(i.dishId, i.qty);
    toast(`已把这 ${rows.length} 道菜加回点菜单`);
  };

  return (
    <div className="rounded-card border border-line bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-[14px] tracking-wide text-ink">
            {formatDate(meal.orderedAt)}
          </p>
          <p className="mt-0.5 text-[10.5px] text-ink-3">
            {meal.orderedBy ? `${meal.orderedBy} 下的单` : "已归档"} · {rows.length} 道 · {total} 份
          </p>
        </div>
        {allowed && (
          <button
            type="button"
            aria-label="删除这一餐"
            onClick={() =>
              confirm({
                title: `删除 ${formatDate(meal.orderedAt)}\n这一餐的记录？`,
                confirmText: "删除",
                onConfirm: () => {
                  void removeMeal(meal.id).then((ok) => {
                    if (!ok) toast("删除失败，请稍后再试");
                  });
                },
              })
            }
            className="grid size-[26px] shrink-0 place-items-center rounded-full text-ink-3 transition active:scale-90"
          >
            <Trash size={14} />
          </button>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {rows.map(({ i, dish }) => (
          <span
            key={i.dishId}
            className="flex items-center gap-1.5 rounded-full border border-line bg-paper py-0.5 pr-2.5 pl-0.5"
          >
            <DishThumb dish={dish} className="size-[20px] shrink-0 rounded-full" sizes="20px" />
            <span className="text-[11.5px] text-ink-2">{dish.name}</span>
            {i.qty > 1 && (
              <span className="text-[10.5px] text-ink-3 tabular-nums">×{i.qty}</span>
            )}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={again}
        className={cn(
          "mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-full",
          "border border-accent/30 bg-accent-soft text-[12px] text-accent transition active:scale-[0.98]",
        )}
      >
        <ArrowCounterClockwise size={12} weight="bold" />
        再来一次
      </button>
    </div>
  );
}

function Placeholder({
  text,
  hint,
  retry,
}: {
  text: string;
  hint?: string;
  retry?: () => void;
}) {
  return (
    <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-2 py-20 text-center">
      <p className="font-display text-[15px] tracking-wider text-ink-3">{text}</p>
      {hint && <p className="mt-2 px-10 text-[11px] leading-relaxed text-ink-3">{hint}</p>}
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-full border border-line bg-card px-4 py-1.5 text-[11.5px] text-ink-2"
        >
          重试
        </button>
      )}
      {!retry && !hint && null}
      {!retry && hint && (
        <Link
          href="/menu"
          className="mt-5 rounded-full bg-accent px-5 py-2 text-[12px] text-white"
        >
          去翻菜单
        </Link>
      )}
    </div>
  );
}

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function formatDate(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `今天 ${hh}:${mm}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  )
    return `昨天 ${hh}:${mm}`;
  const y = d.getFullYear() === now.getFullYear() ? "" : `${d.getFullYear()}/`;
  return `${y}${d.getMonth() + 1}/${d.getDate()} 周${WEEK[d.getDay()]} ${hh}:${mm}`;
}
