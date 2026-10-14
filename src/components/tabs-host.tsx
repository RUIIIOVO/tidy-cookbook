"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getTabFromPath, useTabs } from "@/lib/tab-store";
import { DrawView } from "./draw-view";
import { MenuView } from "./menu-view";
import { CartView } from "./cart-view";
import { HistoryView } from "./history-view";
import { CustomOptionDrawer, DishSheet } from "./lazy-sheets";

export function TabsHost() {
  const pathname = usePathname();
  const activeTab = useTabs((s) => s.activeTab);
  const mountedTabs = useTabs((s) => s.mountedTabs);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const initFromPath = useTabs((s) => s.initFromPath);
  const warmupAllTabs = useTabs((s) => s.warmupAllTabs);

  // 首屏渲染时根据初始 pathname 同步
  const [initialPath] = useState(() => pathname);

  useEffect(() => {
    initFromPath(initialPath);
  }, [initFromPath, initialPath]);

  // 空闲时静默预热其余 Tab，确保首次点击时零卡顿
  useEffect(() => {
    const runWarmup = () => {
      warmupAllTabs();
    };
    if (typeof window !== "undefined") {
      if ("requestIdleCallback" in window) {
        const id = window.requestIdleCallback(runWarmup, { timeout: 3000 });
        return () => window.cancelIdleCallback(id);
      } else {
        const timer = setTimeout(runWarmup, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [warmupAllTabs]);

  // 监听浏览器前进、后退（popstate）
  useEffect(() => {
    const onPopState = () => {
      const tab = getTabFromPath(window.location.pathname);
      setActiveTab(tab, false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setActiveTab]);

  const initialTab = getTabFromPath(initialPath);

  return (
    <>
      {/* 抽菜 (draw) */}
      {(mountedTabs.draw || activeTab === "draw" || initialTab === "draw") && (
        <div className={activeTab === "draw" ? "block" : "hidden"}>
          <DrawView />
        </div>
      )}

      {/* 菜单 (menu) */}
      {(mountedTabs.menu || activeTab === "menu" || initialTab === "menu") && (
        <div className={activeTab === "menu" ? "block" : "hidden"}>
          <MenuView />
        </div>
      )}

      {/* 点菜单 (cart) */}
      {(mountedTabs.cart || activeTab === "cart" || initialTab === "cart") && (
        <div className={activeTab === "cart" ? "block" : "hidden"}>
          <CartView />
        </div>
      )}

      {/* 历史 (history) */}
      {(mountedTabs.history || activeTab === "history" || initialTab === "history") && (
        <div className={activeTab === "history" ? "block" : "hidden"}>
          <HistoryView />
        </div>
      )}

      {/* 全局唯一详情抽屉与自选定制抽屉单例，杜绝多 Tab 视图保活时重叠渲染双层弹窗 */}
      <DishSheet />
      <CustomOptionDrawer />
    </>
  );
}
