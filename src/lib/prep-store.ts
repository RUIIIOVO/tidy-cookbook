"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PrepSeg = "dishes" | "shop";

type PrepUi = {
  /** 备菜页上次停在哪个分段，下次打开接着用 */
  seg: PrepSeg;
  setSeg: (seg: PrepSeg) => void;
};

export const usePrepUi = create<PrepUi>()(
  persist(
    (set) => ({
      seg: "dishes",
      setSeg: (seg) => set({ seg }),
    }),
    {
      name: "prep-ui",
      partialize: (s) => ({ seg: s.seg }),
    },
  ),
);
