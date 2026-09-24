"use client";

import {
  Basket,
  Bird,
  BookOpen,
  BowlFood,
  BowlSteam,
  Cake,
  ChefHat,
  Clock,
  ClockCounterClockwise,
  Cookie,
  CookingPot,
  Cow,
  Egg,
  Fish,
  FishSimple,
  Flame,
  ForkKnife,
  Grains,
  Heartbeat,
  Plant,
  Sparkle,
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
  dessert: Cake,
  diet: Heartbeat,
};

export const subIcon: Record<SubId, Icon> = {
  pork: Cow,
  beef: Cow,
  chicken: Bird,
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
  sweet: Cake,
  snack: Cookie,
  light: Heartbeat,
};

export const tabIcon = {
  draw: Sparkle,
  menu: BookOpen,
  cart: ForkKnife,
  history: ClockCounterClockwise,
} satisfies Record<string, Icon>;

export const metaIcon = {
  time: Clock,
  difficulty: ChefHat,
  spicy: Flame,
  ingredients: Basket,
  steps: CookingPot,
} satisfies Record<string, Icon>;
