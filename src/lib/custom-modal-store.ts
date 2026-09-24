"use client";

import { create } from "zustand";

type ModalState = {
  // 收起时保留 dishId，让抽屉内容撑到退场动画结束；动画结束后才清空
  dishId: string | null;
  visible: boolean;
  // 每次打开递增，用作 key 让表单按最新已选项重新初始化
  seq: number;
  open: (dishId: string) => void;
  close: () => void;
  clear: () => void;
};

export const useCustomModal = create<ModalState>((set) => ({
  dishId: null,
  visible: false,
  seq: 0,
  open: (dishId) => set((s) => ({ dishId, visible: true, seq: s.seq + 1 })),
  close: () => set({ visible: false }),
  clear: () => set({ dishId: null }),
}));
