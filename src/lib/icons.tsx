"use client";

import {
  Basket,
  Bird,
  BookOpen,
  BowlFood,
  BowlSteam,
  ChefHat,
  Clock,
  ClockCounterClockwise,
  CookingPot,
  Cow,
  DiceFive,
  Egg,
  Fish,
  FishSimple,
  ForkKnife,
  Grains,
  Hamburger,
  Pepper,
  Plant,
  Shrimp,
  type Icon,
} from "@phosphor-icons/react";
import type { CategoryId, SubId } from "@/data/types";

/** Phosphor Icons — https://phosphoricons.com */
export const catIcon: Record<CategoryId, Icon> = {
  meat: Cow,
  seafood: Fish,
  veggie: Plant,
  staple: BowlFood,
};

export const subIcon: Record<SubId, Icon> = {
  pork: Cow,
  beef: Cow,
  chicken: Bird,
  western: Hamburger,
  shrimp: Shrimp,
  fish: Fish,
  shellfish: FishSimple,
  crab: Shrimp,
  egg: Egg,
  tofu: Grains,
  greens: Plant,
  soup: CookingPot,
  rice: BowlFood,
  noodle: BowlSteam,
};

export const tabIcon = {
  draw: DiceFive,
  menu: BookOpen,
  cart: ForkKnife,
  history: ClockCounterClockwise,
} satisfies Record<string, Icon>;

export const metaIcon = {
  time: Clock,
  difficulty: ChefHat,
  spicy: Pepper,
  ingredients: Basket,
  steps: CookingPot,
} satisfies Record<string, Icon>;
