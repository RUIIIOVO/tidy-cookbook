import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * iOS「分组列表」基础件（提醒事项 / 设置的样子）：
 * 组标题写在卡片外上方，卡片是白底圆角细边框，行与行之间一条缩进的细分割线。
 * 备菜页的菜品视图和买菜清单共用，保证两个视图是同一套视觉。
 */
export function GroupSection({
  title,
  aside,
  children,
  className,
}: {
  /** 不传则不画标题行 */
  title?: ReactNode;
  /** 标题行右侧（谁点的、编辑按钮等） */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {(title || aside) && (
        <div className="flex min-h-8 items-center justify-between gap-3 px-1 pb-1">
          <h2 className="min-w-0 truncate font-display text-[16px] tracking-wider text-ink">{title}</h2>
          {aside && <div className="flex shrink-0 items-center gap-1 text-[11px] text-ink-3">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** 白底圆角卡片，里面放 GroupRow */
export function GroupCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul className={cn("overflow-hidden rounded-card border border-line bg-card", className)}>
      {children}
    </ul>
  );
}

/**
 * 一行。last 为 true 时不画分割线；inset 是分割线左侧缩进（对齐到文字起点）。
 * 分割线画在 li 底部，行内展开内容时也跟着一起往下走。
 */
export function GroupRow({
  last,
  inset,
  children,
  className,
}: {
  last?: boolean;
  /** 分割线左缩进，px */
  inset: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("relative", className)}>
      {children}
      {!last && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-0 h-px bg-line"
          style={{ left: inset }}
        />
      )}
    </li>
  );
}
