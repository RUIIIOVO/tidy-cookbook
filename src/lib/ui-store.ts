"use client";

import { create } from "zustand";
import { getDish } from "@/data/dishes";
import { hasImage, preloadImage } from "./images";

type SheetState = {
  dishId: string | null;
  open: (dishId: string) => void;
  close: () => void;
};

export const useDishSheet = create<SheetState>((set) => ({
  dishId: null,
  open: (dishId) => {
    const d = getDish(dishId);
    if (d && hasImage(d.id)) {
      void preloadImage(d.image);
    }
    set({ dishId });
  },
  close: () => set({ dishId: null }),
}));
