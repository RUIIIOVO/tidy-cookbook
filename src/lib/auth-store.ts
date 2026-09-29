"use client";

import { create } from "zustand";

export type Me = {
  id: string;
  username: string;
  displayName: string;
  role: "owner" | "guest";
  kitchenId: string;
};

type AuthState = {
  me: Me | null;
  /** null = 还没问过服务端 */
  ready: boolean;
  setMe: (me: Me | null) => void;
  fetchMe: () => Promise<Me | null>;
  logout: () => Promise<void>;
};

/** 登录态本地缓存 90 天，与服务端会话、cookie 保持一致 */
const CACHE_KEY = "tc-me";
const CACHE_MS = 90 * 86400_000;

function readCache(): Me | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { me, at } = JSON.parse(raw) as { me: Me; at: number };
    if (!me || Date.now() - at > CACHE_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return me;
  } catch {
    return null;
  }
}

function writeCache(me: Me | null) {
  try {
    if (me) localStorage.setItem(CACHE_KEY, JSON.stringify({ me, at: Date.now() }));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* 隐私模式等写不进去就算了 */
  }
}

export const useAuth = create<AuthState>()((set) => ({
  me: null,
  ready: false,
  setMe: (me) => {
    writeCache(me);
    set({ me, ready: true });
  },
  fetchMe: async () => {
    // 先用缓存直接进 app，不等网络；再向服务端确认
    const cached = readCache();
    if (cached) set({ me: cached, ready: true });
    try {
      const r = await fetch("/api/me", { credentials: "same-origin" });
      if (r.status === 401) {
        // 只有服务端明确说未登录才清掉
        writeCache(null);
        set({ me: null, ready: true });
        return null;
      }
      if (!r.ok) throw new Error(String(r.status));
      const { user } = (await r.json()) as { user: Me };
      writeCache(user);
      set({ me: user, ready: true });
      return user;
    } catch {
      // 断网 / 5xx：保留缓存的登录态，不把人踢出去
      set({ me: cached, ready: true });
      return cached;
    }
  },
  logout: async () => {
    writeCache(null);
    try {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      /* 断网也要能退出本地状态 */
    }
    set({ me: null, ready: true });
  },
}));

export const canDelete = (me: Me | null) => me?.role === "owner";
