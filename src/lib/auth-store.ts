"use client";

import { create } from "zustand";

export type Me = {
  id: string;
  username: string;
  displayName: string;
  role: "owner" | "guest";
  kitchenId: string;
};

/**
 * 会话令牌的本地副本。cookie 是主通道；浏览器（尤其 iOS Safari / 微信内置浏览器）会无故清 cookie，
 * localStorage 里这份让服务端仍能认出你。登录时写入，退出登录或服务端明确说未登录时清除。
 */
const TOKEN_KEY = "tc-token";
export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 隐私模式写不进去就只靠 cookie */
  }
};
/** 所有走 /api 的请求都用它，统一带上令牌 */
export function authHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  const t = getToken();
  if (t) h.set("Authorization", `Bearer ${t}`);
  return h;
}

/**
 * HTML 头部的内联脚本（scripts/inject-preload.mjs）在 React 启动前就发出了 /api/me，
 * 这里只用一次：首次 fetchMe 复用它，之后（登录、重试）都走正常请求。
 */
function takeEarlyMe(): Promise<Response> {
  const w = window as Window & { __tcMe?: Promise<Response> };
  const early = w.__tcMe;
  w.__tcMe = undefined;
  const fresh = () => fetch("/api/me", { credentials: "same-origin", headers: authHeaders() });
  // 提前请求失败（断网等）就再正常请求一次
  return early ? early.catch(fresh) : fresh();
}

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
      const r = await takeEarlyMe();
      if (r.status === 401) {
        // 只有服务端明确说未登录才清掉
        writeCache(null);
        setToken(null);
        set({ me: null, ready: true });
        return null;
      }
      if (!r.ok) throw new Error(String(r.status));
      const { user, token } = (await r.json()) as { user: Me; token?: string };
      if (token) setToken(token);
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
    const h = authHeaders();
    writeCache(null);
    setToken(null);
    try {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin", headers: h });
    } catch {
      /* 断网也要能退出本地状态 */
    }
    set({ me: null, ready: true });
  },
}));

export const canDelete = (me: Me | null) => me?.role === "owner";
