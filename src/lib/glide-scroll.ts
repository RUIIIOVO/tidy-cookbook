/**
 * 分段跳转的「两段式」滚动：近处直接平滑滚；远处先瞬移到目标前 GLIDE_PX，再平滑滚完最后这段。
 * 菜单页（滚 window）和选菜弹层（滚容器）共用。
 */

/** 长距离跳转时只平滑滑完最后这一段，前面直接定位 */
export const GLIDE_PX = 320;

export type Scroller = {
  top: () => number;
  to: (top: number, behavior: ScrollBehavior) => void;
};

export const windowScroller: Scroller = {
  top: () => window.scrollY,
  to: (top, behavior) => window.scrollTo({ top, behavior }),
};

export const elementScroller = (el: HTMLElement): Scroller => ({
  top: () => el.scrollTop,
  to: (top, behavior) => el.scrollTo({ top, behavior }),
});

/**
 * 滚到 y。每次确定落点时调 lock(y)，调用方借此在滚动途中锁住高亮。
 * 两段式时返回第二段的定时器（调用方负责在取消时 clearTimeout），否则返回 null。
 * 已经在目标位置（差不到 2px）时什么都不做，也不调 lock。
 */
export function glideScroll(
  sc: Scroller,
  y: number,
  refetch: () => number | null,
  lock: (y: number) => void,
): ReturnType<typeof setTimeout> | null {
  const dy = y - sc.top();
  if (Math.abs(dy) < 2) return null;

  lock(y);
  if (Math.abs(dy) <= GLIDE_PX) {
    sc.to(y, "smooth");
    return null;
  }
  sc.to(y - Math.sign(dy) * GLIDE_PX, "instant");
  // 必须隔一个事件循环再 smooth，否则浏览器会把两次合并成一次长距离滚动。
  // 第二段重新取坐标，防止期间布局有变化
  return setTimeout(() => {
    const y2 = refetch() ?? y;
    lock(y2);
    sc.to(y2, "smooth");
  }, 25);
}
