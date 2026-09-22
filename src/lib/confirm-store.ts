"use client";

import { create } from "zustand";

export type ConfirmOptions = {
  title: string;
  desc?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
};

type ConfirmState = {
  opts: ConfirmOptions | null;
  confirm: (o: ConfirmOptions) => void;
  close: () => void;
};

export const useConfirm = create<ConfirmState>((set) => ({
  opts: null,
  confirm: (o) => set({ opts: o }),
  close: () => set({ opts: null }),
}));
