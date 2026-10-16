"use client";

import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";
import { cn, haptic } from "@/lib/utils";

/**
 * 横向并排的多页面板：跟手拖动、松手按位移 / 速度吸附。
 *
 * - 用 transform 平移，不用 scroll-snap 横滚容器，避免和外层纵向滚动抢手势。
 * - 先判定方向再锁轴：纵向优先时整段手势交给浏览器滚动。
 * - 进度 pos 是「当前在第几页」的连续值（0~count-1），顶部 tab 的下划线直接订阅它，
 *   所以下划线和页面是同一个手势、同一帧在动，不触发 React 重渲染。
 * - 容器高度跟着 pos 在相邻两页高度之间插值，短面板下面不会留大片空白。
 * - 触摸监听挂在外层容器上；调用方让它 flex-1 铺满剩余高度，面板下方的空白也能滑。
 */

const SPRING = { type: "spring", stiffness: 420, damping: 42, mass: 0.9 } as const;

export type Pager = {
  /** 连续页码进度 */
  pos: MotionValue<number>;
  /** 吸附到某页；velocity 单位：页 / 秒 */
  snapTo: (i: number, velocity?: number) => void;
};

/** 创建进度值，并在外部改了页码（点 tab、读到本地记忆）时把它带过去 */
export function usePager(index: number): Pager {
  const pos = useMotionValue(0);
  const target = useRef(index);
  const mounted = useRef(false);

  const snapTo = useCallback(
    (i: number, velocity = 0) => {
      target.current = i;
      void animate(pos, i, { ...SPRING, velocity });
    },
    [pos],
  );

  useLayoutEffect(() => {
    // 首次直接就位，不做动画
    if (!mounted.current) {
      mounted.current = true;
      target.current = index;
      pos.set(index);
      return;
    }
    // 手势松手时 snapTo 已经带着速度出发了，别再重启一遍
    if (target.current !== index) snapTo(index);
  }, [index, pos, snapTo]);

  return { pos, snapTo };
}

export function SwipePanels({
  pager,
  index,
  onIndexChange,
  panels,
  className,
}: {
  pager: Pager;
  /** 当前页（受控） */
  index: number;
  onIndexChange: (i: number) => void;
  panels: ReactNode[];
  /** 外层容器的额外样式；放进 flex 列里写 flex-1，面板短时手势区也能铺到底 */
  className?: string;
}) {
  const { pos, snapTo } = pager;
  const count = panels.length;

  const wrapRef = useRef<HTMLDivElement>(null);
  const panelEls = useRef<(HTMLDivElement | null)[]>([]);
  const heights = useRef<number[]>([]);
  // 测量前保持 auto（SSR / 首帧不会被裁成 0 高）
  const height = useMotionValue<number | string>("auto");

  const trackX = useTransform(pos, (p) => `${(-p * 100) / count}%`);

  // 容器高度 = 相邻两页高度按 pos 插值
  const recompute = useCallback(() => {
    const p = Math.min(Math.max(pos.get(), 0), count - 1);
    const i = Math.floor(p);
    const a = heights.current[i] ?? 0;
    const b = heights.current[Math.min(i + 1, count - 1)] ?? a;
    if (!a) return; // 还没量到（页面被隐藏），先保持 auto
    height.set(a + (b - a) * (p - i));
  }, [pos, height, count]);

  useMotionValueEvent(pos, "change", recompute);

  useLayoutEffect(() => {
    const measure = () => {
      panelEls.current.forEach((el, i) => {
        // 备菜页被切走时整页 display:none，高度是 0，别当真
        if (el && el.offsetHeight > 0) heights.current[i] = el.offsetHeight;
      });
      recompute();
    };
    measure();
    const ro = new ResizeObserver(measure);
    panelEls.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [recompute, count]);

  // ── 手势 ────────────────────────────────────────────────
  const g = useRef<{
    x: number;
    y: number;
    startPos: number;
    width: number;
    axis: "x" | "y" | null;
    lastX: number;
    lastT: number;
    v: number; // px / ms，向右为正
  } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      g.current = null;
      return;
    }
    const t = e.touches[0];
    pos.stop();
    g.current = {
      x: t.clientX,
      y: t.clientY,
      startPos: pos.get(),
      width: wrapRef.current?.offsetWidth || window.innerWidth,
      axis: null,
      lastX: t.clientX,
      lastT: performance.now(),
      v: 0,
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const s = g.current;
    if (!s) return;
    const t = e.touches[0];

    if (s.axis === null) {
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // 纵向更明显就放给页面滚动；否则锁横向，并以此刻为起点免得跳 8px
      if (Math.abs(dy) >= Math.abs(dx) * 1.15) {
        s.axis = "y";
        return;
      }
      s.axis = "x";
      s.x = t.clientX;
      s.lastX = t.clientX;
      s.lastT = performance.now();
    }
    if (s.axis !== "x") return;

    const now = performance.now();
    const dt = now - s.lastT;
    if (dt > 0) s.v = s.v * 0.4 + ((t.clientX - s.lastX) / dt) * 0.6;
    s.lastX = t.clientX;
    s.lastT = now;

    // 首尾两页再往外拖有阻尼
    let p = s.startPos - (t.clientX - s.x) / s.width;
    const max = count - 1;
    if (p < 0) p *= 0.3;
    else if (p > max) p = max + (p - max) * 0.3;
    pos.set(p);
  };

  const finish = (cancel: boolean) => {
    const s = g.current;
    g.current = null;
    if (!s || s.axis !== "x") return;

    const base = Math.round(s.startPos);
    const disp = pos.get() - s.startPos; // 页，正 = 往后一页
    // 停住不动再松手，不算甩动
    const v = performance.now() - s.lastT > 100 ? 0 : s.v;
    const vel = (-v * 1000) / s.width; // 页 / 秒

    let target = base;
    if (!cancel) {
      if (disp > 0.3 || (vel > 0.9 && disp > 0.04)) target = base + 1;
      else if (disp < -0.3 || (vel < -0.9 && disp < -0.04)) target = base - 1;
    }
    target = Math.min(Math.max(target, 0), count - 1);

    snapTo(target, vel);
    if (target !== index) {
      haptic(8);
      onIndexChange(target);
    }
  };

  return (
    <motion.div
      ref={wrapRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => finish(false)}
      onTouchCancel={() => finish(true)}
      style={{ height }}
      className={cn("touch-pan-y overflow-hidden", className)}
    >
      <motion.div
        style={{ x: trackX, width: `${count * 100}%` }}
        className="flex items-start will-change-transform"
      >
        {panels.map((panel, i) => (
          <div
            key={i}
            ref={(el) => {
              panelEls.current[i] = el;
            }}
            role="tabpanel"
            // 没轮到的那页：不可聚焦、读屏跳过
            inert={i !== index}
            className="min-w-0 flex-1"
          >
            {panel}
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
