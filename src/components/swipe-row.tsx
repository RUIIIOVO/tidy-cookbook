"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { Trash } from "@phosphor-icons/react";

/** 圆形按钮 48 + 左右留白，卡片左移这么多露出按钮 */
const ACTION_W = 68;
const BTN = 48;

/**
 * 左滑露出右侧删除按钮。竖向滚动不受影响（motion 的 drag="x" 只占横向手势）。
 * 展开状态由父级持有，保证同一时间只开一行。
 */
export function SwipeRow({
  open,
  onOpenChange,
  onDelete,
  disabled,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const x = useMotionValue(0);
  const btnOpacity = useTransform(x, [-ACTION_W * 0.35, 0], [1, 0]);
  const btnScale = useTransform(x, [-ACTION_W, -ACTION_W * 0.3, 0], [1, 0.7, 0.5]);
  const dragged = useRef(false);

  useEffect(() => {
    const target = open && !disabled ? -ACTION_W : 0;
    const c = animate(x, target, { type: "spring", stiffness: 520, damping: 42 });
    return () => c.stop();
  }, [open, disabled, x]);

  if (disabled) return <>{children}</>;

  return (
    <div className="relative">
      <motion.button
        type="button"
        aria-label="删除"
        style={{ width: BTN, height: BTN, opacity: btnOpacity, scale: btnScale }}
        onClick={onDelete}
        className="absolute right-[10px] top-1/2 -mt-6 grid place-items-center rounded-full border border-line bg-card text-chili shadow-2xs active:brightness-95"
      >
        <Trash size={22} weight="fill" />
      </motion.button>

      <motion.div
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -ACTION_W, right: 0 }}
        dragElastic={0.08}
        dragMomentum={false}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={(_, info) => {
          const shouldOpen = open
            ? info.offset.x < ACTION_W / 3
            : info.offset.x < -ACTION_W / 3 || info.velocity.x < -400;
          // 与当前状态一致时 effect 不会触发，手动回弹到位
          if (shouldOpen === open)
            animate(x, shouldOpen ? -ACTION_W : 0, {
              type: "spring",
              stiffness: 520,
              damping: 42,
            });
          else onOpenChange(shouldOpen);
          setTimeout(() => (dragged.current = false), 60);
        }}
        onClickCapture={(e) => {
          // 拖动结束或行处于展开态时，点击只用来收起，不触发行内的打开详情
          if (dragged.current || open) {
            e.stopPropagation();
            e.preventDefault();
            if (open) onOpenChange(false);
          }
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
