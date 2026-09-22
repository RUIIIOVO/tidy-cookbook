"use client";

import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { haptic } from "@/lib/utils";

type ConfirmOptions = {
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

export function ConfirmHost() {
  const opts = useConfirm((s) => s.opts);
  const close = useConfirm((s) => s.close);

  return (
    <AnimatePresence>
      {opts && (
        <motion.div
          key="confirm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={close}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/35 px-10 backdrop-blur-[2px]"
        >
          <motion.div
            initial={{ scale: 0.94, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 4 }}
            transition={{ type: "spring", stiffness: 460, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[300px] overflow-hidden rounded-2xl border border-line bg-card"
          >
            <div className="px-5 pt-6 pb-5 text-center">
              <h3 className="font-display text-[17px] tracking-wider text-ink">
                {opts.title}
              </h3>
              {opts.desc && (
                <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{opts.desc}</p>
              )}
            </div>
            <div className="flex border-t border-line">
              <button
                type="button"
                onClick={close}
                className="flex-1 border-r border-line py-3.5 text-[14px] text-ink-2 transition active:bg-paper"
              >
                {opts.cancelText ?? "取消"}
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic(15);
                  opts.onConfirm();
                  close();
                }}
                className={
                  "flex-1 py-3.5 text-[14px] font-medium transition active:bg-paper " +
                  (opts.danger === false ? "text-ink" : "text-chili")
                }
              >
                {opts.confirmText ?? "删除"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
