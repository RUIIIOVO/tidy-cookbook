"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CUSTOM_CONFIGS } from "@/data/custom-options";
import { normalizeDishId } from "@/data/dishes";

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
      // 旧版本按拼音 slug 存的选择，转成数字 id
      merge: (persisted, current) => {
        const raw = ((persisted as Partial<CustomStore> | undefined)?.choices ?? {}) as CustomChoiceMap;
        const choices: CustomChoiceMap = {};
        for (const [k, v] of Object.entries(raw)) choices[normalizeDishId(k)] = v;
        return { ...current, choices };
      },
    },
  ),
);
