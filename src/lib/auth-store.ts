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

export const useAuth = create<AuthState>()((set) => ({
  me: null,
  ready: false,
  setMe: (me) => set({ me, ready: true }),
  fetchMe: async () => {
    try {
      const r = await fetch("/api/me", { credentials: "same-origin" });
      if (!r.ok) {
        set({ me: null, ready: true });
        return null;
      }
      const { user } = (await r.json()) as { user: Me };
      set({ me: user, ready: true });
      return user;
    } catch {
      set({ me: null, ready: true });
      return null;
    }
  },
  logout: async () => {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    set({ me: null, ready: true });
  },
}));

export const canDelete = (me: Me | null) => me?.role === "owner";
