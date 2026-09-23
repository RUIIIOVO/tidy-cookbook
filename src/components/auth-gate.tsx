"use client";

import { useEffect, useState } from "react";
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

/** 只在掉线时出现，联上就自己消失 —— 正常状态不该占视觉 */
function SyncBadge() {
  const [status, setStatus] = useState<SyncStatus>("online");
  useEffect(() => onSyncStatus(setStatus), []);
  if (status === "online") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[env(safe-area-inset-top)]">
      <span className="mt-2 rounded-full bg-ink/80 px-3 py-1 text-[10.5px] tracking-wider text-paper backdrop-blur">
        {status === "connecting" ? "连接中…" : "离线，改动会在恢复后同步"}
      </span>
    </div>
  );
}
