"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CUSTOM_CONFIGS } from "@/data/custom-options";

type CustomChoiceMap = Record<string, Record<string, string | string[]>>;

type CustomStore = {
  choices: CustomChoiceMap;
  getChoice: (dishId: string) => Record<string, string | string[]>;
  setChoice: (dishId: string, val: Record<string, string | string[]>) => void;
  resetChoice: (dishId: string) => void;
};

export const useCustomStore = create<CustomStore>()(
  persist(
    (set, get) => ({
      choices: {},
      getChoice: (dishId: string) => {
        const stored = get().choices[dishId];
        if (stored) return stored;
        const cfg = CUSTOM_CONFIGS[dishId];
        return cfg ? { ...cfg.defaultValues } : {};
      },
      setChoice: (dishId: string, val: Record<string, string | string[]>) => {
        set((s) => ({
          choices: { ...s.choices, [dishId]: val },
        }));
      },
      resetChoice: (dishId: string) => {
        set((s) => {
          const next = { ...s.choices };
          delete next[dishId];
          return { choices: next };
        });
      },
    }),
    {
      name: "tidy-cookbook-custom-choices",
    },
  ),
);
