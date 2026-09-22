"use client";

import { create } from "zustand";

type SheetState = {
  dishId: string | null;
  open: (dishId: string) => void;
  close: () => void;
};

export const useDishSheet = create<SheetState>((set) => ({
  dishId: null,
  open: (dishId) => set({ dishId }),
  close: () => set({ dishId: null }),
}));
