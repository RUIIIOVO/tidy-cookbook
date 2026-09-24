"use client";

import { useState } from "react";
import Image from "next/image";
import { Drawer } from "vaul";
import { BowlFood, Check, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { CUSTOM_CONFIGS } from "@/data/custom-options";
import { INGREDIENT_IMAGES } from "@/data/ingredient-images";
import { getDish } from "@/data/dishes";
import { useCustomModal } from "@/lib/custom-modal-store";
import { useCustomStore } from "@/lib/custom-store";
import { useCart } from "@/lib/store";
import { haptic } from "@/lib/utils";
import { useGuard } from "@/lib/use-guard";

export function CustomOptionDrawer() {
  const dishId = useCustomModal((s) => s.dishId);
  const visible = useCustomModal((s) => s.visible);
  const seq = useCustomModal((s) => s.seq);
  const close = useCustomModal((s) => s.close);
  const clear = useCustomModal((s) => s.clear);

  if (!dishId) return null;

  return (
    <CustomOptionDrawerContent
      key={seq}
      dishId={dishId}
      visible={visible}
      close={close}
      clear={clear}
    />
  );
}

function CustomOptionDrawerContent({
  dishId,
  visible,
  close,
  clear,
}: {
  dishId: string;
  visible: boolean;
  close: () => void;
  clear: () => void;
}) {
  const getChoice = useCustomStore((s) => s.getChoice);
  const setChoice = useCustomStore((s) => s.setChoice);
  const add = useCart((s) => s.add);
  const locked = useCart((s) => s.locked);
  const inCart = useCart((s) => s.items.some((i) => i.dishId === dishId));

  const cfg = CUSTOM_CONFIGS[dishId];
  const dish = getDish(dishId);

  // 还没生成出来的配图，退回纯色底 + 图标
  const [broken, setBroken] = useState<Set<string>>(() => new Set());

  const [form, setForm] = useState<Record<string, string | string[]>>(() =>
    getChoice(dishId),
  );

  const toggleSingle = (groupId: string, opt: string) => {
    haptic(6);
    setForm((prev) => ({ ...prev, [groupId]: opt }));
  };

  const toggleMultiple = (groupId: string, opt: string, min = 0) => {
    haptic(6);
    setForm((prev) => {
      const cur = (prev[groupId] as string[]) || [];
      if (cur.includes(opt)) {
        if (cur.length <= min) {
          toast(`至少需要保留 ${min} 项`);
          return prev;
        }
        return { ...prev, [groupId]: cur.filter((x) => x !== opt) };
      }
      return { ...prev, [groupId]: [...cur, opt] };
    });
  };

  const onConfirm = useGuard(() => {
    // 退场动画期间按钮仍可点，直接忽略
    if (!visible || !cfg || !dish) return;
    if (locked) {
      toast("这一餐已经定了，想改先点「重新编辑」");
      return;
    }

    // 校验必选
    for (const g of cfg.groups) {
      const val = form[g.id];
      if (g.required) {
        if (!val || (Array.isArray(val) && val.length === 0)) {
          toast(`请选择【${g.name}】`);
          return;
        }
      }
    }

    setChoice(dishId, form);
    if (!inCart) {
      add(dishId, 1);
      toast(`已加入 · ${dish.name}`);
    } else {
      toast(`已更新 · ${dish.name} 的定制搭配`);
    }
    haptic(15);
    close();
  }, 400);

  if (!cfg || !dish) return null;

  return (
    <Drawer.Root
      open={visible}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      onAnimationEnd={(o) => {
        if (!o) clear();
      }}
      repositionInputs={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/35" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] max-w-[520px] flex-col rounded-t-2xl border-t border-line bg-paper outline-none">
          <div className="shrink-0 pt-2.5 pb-1">
            <div className="mx-auto h-1 w-9 rounded-full bg-line-2" />
          </div>

          {/* 顶栏 */}
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div>
              <Drawer.Title className="font-display text-[18px] tracking-wide text-ink">
                {cfg.title}
              </Drawer.Title>
              <Drawer.Description className="mt-0.5 text-[11px] text-ink-3">
                {cfg.subtitle}
              </Drawer.Description>
            </div>
            <button
              type="button"
              onClick={close}
              className="grid size-7 place-items-center rounded-full bg-paper-2 text-ink-2"
            >
              <X size={15} />
            </button>
          </div>

          {/* 选项主体 */}
          <div className="no-scrollbar flex-1 space-y-7 overflow-y-auto px-5 pt-4 pb-6">
            {cfg.groups.map((group) => {
              const currentVal = form[group.id];
              const isSelected = (opt: string) =>
                group.type === "single"
                  ? currentVal === opt
                  : Array.isArray(currentVal) && currentVal.includes(opt);
              const onPick = (opt: string) =>
                group.type === "single"
                  ? toggleSingle(group.id, opt)
                  : toggleMultiple(group.id, opt, group.min ?? 0);
              const withImages = group.options.every((o) => INGREDIENT_IMAGES[o]);
              const count = Array.isArray(currentVal) ? currentVal.length : 0;
              // 3 个一行刚好排满时用 3 列，其余 4 列
              const cols = group.options.length % 3 === 0 ? "grid-cols-3" : "grid-cols-4";

              return (
                <section key={group.id}>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h3 className="font-display text-[15px] tracking-wide text-ink">
                      {group.name}
                    </h3>
                    <span className="text-[11px] text-ink-3">
                      {group.type === "single" ? (
                        "单选"
                      ) : (
                        <>
                          可多选
                          {count > 0 && (
                            <span className="ml-1 text-accent">· 已选 {count}</span>
                          )}
                        </>
                      )}
                    </span>
                  </div>

                  {withImages ? (
                    <div className={`grid ${cols} gap-x-2.5 gap-y-3.5`}>
                      {group.options.map((opt) => {
                        const selected = isSelected(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => onPick(opt)}
                            className="flex flex-col items-stretch text-center transition active:scale-[0.96]"
                          >
                            <span
                              className={`relative block aspect-square overflow-hidden rounded-2xl bg-paper-2 transition ${
                                selected
                                  ? "ring-2 ring-accent ring-offset-2 ring-offset-paper"
                                  : "ring-1 ring-line"
                              }`}
                            >
                              {broken.has(opt) ? (
                                <span className="grid size-full place-items-center text-ink-3">
                                  <BowlFood size={26} weight="light" />
                                </span>
                              ) : (
                                <Image
                                  src={INGREDIENT_IMAGES[opt]}
                                  alt={opt}
                                  width={200}
                                  height={200}
                                  className="size-full scale-[1.12] object-cover"
                                  onError={() =>
                                    setBroken((prev) => new Set(prev).add(opt))
                                  }
                                />
                              )}
                              {selected && (
                                <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-accent text-white shadow-sm">
                                  <Check size={11} weight="bold" />
                                </span>
                              )}
                            </span>
                            <span
                              className={`mt-2 line-clamp-2 px-0.5 text-[11.5px] leading-snug ${
                                selected ? "font-medium text-accent" : "text-ink-2"
                              }`}
                            >
                              {opt}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    // 无配图的选项（温度、基底）用胶囊
                    <div className="flex flex-wrap gap-2">
                      {group.options.map((opt) => {
                        const selected = isSelected(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => onPick(opt)}
                            className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-[12.5px] transition active:scale-95 ${
                              selected
                                ? "border-accent bg-accent font-medium text-white"
                                : "border-line bg-card text-ink-2"
                            }`}
                          >
                            {selected && <Check size={12} weight="bold" />}
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {/* 确认底栏 */}
          <div className="border-t border-line bg-card p-4">
            <button
              type="button"
              onClick={onConfirm}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-[14px] font-medium tracking-wider text-white transition active:scale-[0.99]"
            >
              <span>{inCart ? "确认修改" : "选好了，加入点菜单"}</span>
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
