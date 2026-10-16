"use client";

import { create } from "zustand";
import { getDish } from "@/data/dishes";
import { hasImage, preloadImage } from "./images";

type SheetState = {
  dishId: string | null;
  /** 打开后直接定位到哪一段；备菜页看菜要的是食材和做法 */
  focus: "ingredients" | null;
  open: (dishId: string, opts?: { focus?: "ingredients" }) => void;
  close: () => void;
};

export const useDishSheet = create<SheetState>((set) => ({
  dishId: null,
  focus: null,
  open: (dishId, opts) => {
    const d = getDish(dishId);
    if (d && hasImage(d.id)) {
      void preloadImage(d.image);
    }
    set({ dishId, focus: opts?.focus ?? null });
  },
  close: () => set({ dishId: null, focus: null }),
}));
