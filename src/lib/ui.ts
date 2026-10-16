/**
 * 全站共用的控件尺寸。同一类控件高度、字号、圆角保持一致，不要在组件里各写各的。
 *
 * - chip：筛选胶囊、用餐选择、「管理」「再点一次」这类小按钮，高 32
 * - iconBtn：卡片右上角的编辑 / 删除图标，32×32
 * - primary：底部主按钮，高 48
 */
export const ui = {
  chip: "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full px-3.5 text-[12.5px] transition active:scale-95 disabled:opacity-50",
  chipOn: "border border-accent bg-accent font-medium text-white",
  chipOff: "border border-line bg-card text-ink-2",
  chipSoft: "bg-accent-soft text-accent",
  iconBtn:
    "grid size-8 shrink-0 place-items-center rounded-full text-ink-3 transition active:scale-90 active:bg-paper-2",
  primary:
    "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-medium tracking-wide text-white transition active:scale-[0.99] disabled:opacity-40",
} as const;
