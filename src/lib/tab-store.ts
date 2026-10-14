"use client";

import { create } from "zustand";

export type TabKey = "draw" | "menu" | "cart" | "history";

export const TAB_PATH_MAP: Record<TabKey, string> = {
  draw: "/",
  menu: "/menu/",
  cart: "/cart/",
  history: "/history/",
};

export function getTabFromPath(path: string): TabKey {
  const clean = path.replace(/\/$/, "") || "/";
  if (clean === "/menu") return "menu";
  if (clean === "/cart") return "cart";
  if (clean === "/history") return "history";
  return "draw";
}

interface TabState {
  activeTab: TabKey;
  // 记录已经实例化并挂载过的 tab（按需挂载，常驻保活，永不重复销毁）
  mountedTabs: Record<TabKey, boolean>;
  // 记录每个 Tab 的滚动条绝对位置，切回时瞬时还原
  scrollPositions: Record<TabKey, number>;
  setActiveTab: (tab: TabKey, updateUrl?: boolean) => void;
  initFromPath: (path: string) => void;
  warmupAllTabs: () => void;
}

export const useTabs = create<TabState>()((set, get) => ({
  activeTab: "draw",
  mountedTabs: {
    draw: false,
    menu: false,
    cart: false,
    history: false,
  },
  scrollPositions: {
    draw: 0,
    menu: 0,
    cart: 0,
    history: 0,
  },
  setActiveTab: (nextTab, updateUrl = true) => {
    const curTab = get().activeTab;
    if (curTab === nextTab) return;

    // 1. 记下切出 Tab 当前的滚动条位置
    if (typeof window !== "undefined") {
      get().scrollPositions[curTab] = window.scrollY;
      if (updateUrl) {
        window.history.pushState(null, "", TAB_PATH_MAP[nextTab]);
      }
    }

    // 2. 变更激活 Tab 并标记为已挂载
    set((s) => ({
      activeTab: nextTab,
      mountedTabs: {
        ...s.mountedTabs,
        [nextTab]: true,
      },
    }));

    // 3. 瞬时还原目标 Tab 先前的滚动位置
    if (typeof window !== "undefined") {
      const targetScroll = get().scrollPositions[nextTab] || 0;
      requestAnimationFrame(() => {
        window.scrollTo({ top: targetScroll, behavior: "instant" });
      });
    }
  },
  initFromPath: (path) => {
    const tab = getTabFromPath(path);
    set((s) => ({
      activeTab: tab,
      mountedTabs: {
        ...s.mountedTabs,
        [tab]: true,
      },
    }));
  },
  warmupAllTabs: () => {
    set({
      mountedTabs: {
        draw: true,
        menu: true,
        cart: true,
        history: true,
      },
    });
  },
}));
