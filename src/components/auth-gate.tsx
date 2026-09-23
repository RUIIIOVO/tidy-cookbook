"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-store";
import { useCart } from "@/lib/store";
import { onSyncStatus, startSync } from "@/lib/sync";
import { LoginCard } from "./login-card";

/**
 * 包住整个 app：先问 /api/me，没登录就显示登录卡片，
 * 登录后建立 WebSocket 同步。静态导出下这一步只能在客户端做。
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const me = useAuth((s) => s.me);
  const ready = useAuth((s) => s.ready);
  const fetchMe = useAuth((s) => s.fetchMe);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    if (!me) return;
    useCart.getState().setOnDenied((reason) => toast(reason));
    return startSync();
  }, [me]);

  // 网络状态监听：日常完全静默；首屏加载或刷新不提示；仅在使用过程中真正断线重连后轻提示一次
  useEffect(() => {
    let hasConnectedOnce = false;
    let hadDisconnected = false;

    return onSyncStatus((s) => {
      if (s === "online") {
        if (hasConnectedOnce && hadDisconnected) {
          hadDisconnected = false;
          toast("网络已恢复");
        }
        hasConnectedOnce = true;
      } else if (s === "offline" || s === "connecting") {
        if (hasConnectedOnce) {
          hadDisconnected = true;
        }
      }
    });
  }, []);

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper">
        <p className="font-display text-[13px] tracking-[0.3em] text-ink-3">
          载入中
        </p>
      </div>
    );
  }

  if (!me) return <LoginCard />;

  return children;
}
