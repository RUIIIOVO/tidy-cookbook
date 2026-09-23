"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-store";
import { useCart } from "@/lib/store";
import { onSyncStatus, startSync, type SyncStatus } from "@/lib/sync";
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

  return (
    <>
      {children}
      <SyncBadge />
    </>
  );
}

/** 环境式离线指示器：极简微胶囊，轻量不遮挡内容 */
function SyncBadge() {
  const [status, setStatus] = useState<SyncStatus>("online");
  const prevStatusRef = useRef<SyncStatus>("online");

  useEffect(() => {
    return onSyncStatus((s) => {
      // 掉线或重连时，通过轻量 Toast 提示一次
      if (prevStatusRef.current === "online" && s === "offline") {
        toast("已进入离线模式，改动稍后同步");
      } else if (prevStatusRef.current !== "online" && s === "online") {
        toast("网络已恢复，改动已同步");
      }
      prevStatusRef.current = s;
      setStatus(s);
    });
  }, []);

  if (status === "online") return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center pt-[env(safe-area-inset-top,0px)]">
      <div className="mt-1.5 flex items-center gap-1.5 rounded-full border border-caramel/30 bg-card/90 px-2.5 py-0.5 text-[10.5px] tracking-wide text-caramel shadow-xs backdrop-blur-md">
        <span className="size-1.5 rounded-full bg-caramel animate-pulse" />
        <span>{status === "connecting" ? "重新连接中…" : "离线模式"}</span>
      </div>
    </div>
  );
}
