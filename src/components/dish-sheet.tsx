"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { getDish } from "@/data/dishes";
import { catTheme, spicyLabel, difficultyLabel } from "@/lib/theme";
import { useCart } from "@/lib/store";
import { useDishSheet } from "@/lib/ui-store";
import { haptic } from "@/lib/utils";
import { DishThumb } from "./dish-thumb";

export function DishSheet() {
  const dishId = useDishSheet((s) => s.dishId);
  const close = useDishSheet((s) => s.close);
  const add = useCart((s) => s.add);
  const locked = useCart((s) => s.locked);
  const [n, setN] = useState(1);

  const dish = dishId ? getDish(dishId) : undefined;
  const t = dish ? catTheme[dish.category] : null;

  return (
    <Drawer.Root
      open={!!dish}
      onOpenChange={(o) => {
        if (!o) close();
        setN(1);
      }}
      repositionInputs={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/35" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[88dvh] max-w-[520px] flex-col rounded-t-2xl border-t border-line bg-paper outline-none">
          {dish && t && (
            <>
              <div className="shrink-0 pt-2.5 pb-1">
                <div className="mx-auto h-1 w-9 rounded-full bg-line-2" />
              </div>

              <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6">
                <Drawer.Title className="sr-only">{dish.name}</Drawer.Title>

                <DishThumb
                  dish={dish}
                  className="aspect-[16/10] w-full rounded-xl"
                  sizes="(max-width:520px) 100vw, 520px"
                  priority
                  variant="lg"
                />

                <div className="mt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-[23px] leading-tight tracking-wider text-ink">
                      {dish.name}
                    </h2>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
                      {dish.desc}
                    </p>
                  </div>
                  <span
                    className={`mt-1 shrink-0 rounded-full px-2 py-0.5 text-[10.5px] ${t.bg} ${t.text}`}
                  >
                    {dish.tags[0] ?? "家常"}
                  </span>
                </div>

                <div className="mt-4 flex divide-x divide-line rounded-card border border-line bg-card">
                  {[
                    ["耗时", `${dish.minutes} 分钟`],
                    ["难度", difficultyLabel[dish.difficulty]],
                    ["辣度", spicyLabel[dish.spicy]],
                  ].map(([k, v]) => (
                    <div key={k} className="flex-1 px-3 py-2.5 text-center">
                      <div className="text-[10px] text-ink-3">{k}</div>
                      <div className="mt-0.5 text-[13px] text-ink tabular-nums">{v}</div>
                    </div>
                  ))}
                </div>

                <SectionTitle>食材</SectionTitle>
                <div className="space-y-3">
                  {dish.ingredients.map((g) => (
                    <div key={g.group}>
                      <div className="mb-1.5 text-[10.5px] tracking-[0.2em] text-ink-3">
                        {g.group}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {g.items.map((it) => (
                          <div
                            key={it.name}
                            className="flex items-baseline justify-between gap-2 border-b border-dashed border-line pb-1"
                          >
                            <span className="text-[12.5px] text-ink">{it.name}</span>
                            <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">
                              {it.amount}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <SectionTitle>做法</SectionTitle>
                <ol className="space-y-3">
                  {dish.steps.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span
                        className="mt-[3px] shrink-0 font-display text-[13px] leading-none tabular-nums"
                        style={{ color: t.hex }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="text-[13px] leading-[1.7] text-ink">{s}</p>
                    </li>
                  ))}
                </ol>
              </div>

              <div
                className="shrink-0 border-t border-line bg-paper/95 px-5 py-3 backdrop-blur"
                style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 rounded-full border border-line-2 bg-card px-3 py-2">
                    <button
                      type="button"
                      aria-label="减少"
                      onClick={() => {
                        haptic(8);
                        setN((v) => Math.max(1, v - 1));
                      }}
                      className="text-ink-2 active:scale-90"
                    >
                      <Minus size={15} />
                    </button>
                    <span className="w-4 text-center text-[14px] tabular-nums">{n}</span>
                    <button
                      type="button"
                      aria-label="增加"
                      onClick={() => {
                        haptic(8);
                        setN((v) => v + 1);
                      }}
                      className="text-ink-2 active:scale-90"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (locked) {
                        toast("点菜单已锁定，先解锁再加菜");
                        return;
                      }
                      haptic();
                      add(dish.id, n);
                      toast(`已加入 ${n} 份 · ${dish.name}`);
                      close();
                    }}
                    className="flex-1 rounded-full bg-ink py-3 text-[14px] tracking-wide text-paper transition active:scale-[0.98]"
                  >
                    加入点菜单
                  </button>
                </div>
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-7 mb-3 flex items-center gap-3">
      <h3 className="font-display text-[15px] tracking-[0.25em] text-ink">{children}</h3>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
