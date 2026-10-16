"use client";

import {
  Basket,
  Bird,
  BookOpen,
  BowlFood,
  BowlSteam,
  Cake,
  Cookie,
  CookingPot,
  Cow,
  Egg,
  Fish,
  FishSimple,
  Flame,
  Tag,
  ForkKnife,
  Grains,
  Heartbeat,
  Knife,
  Plant,
  Receipt,
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
  prep: Knife,
  history: Receipt,
} satisfies Record<string, Icon>;

/** 备菜页顶部分段控件：菜品 / 买菜清单 */
export const prepTabIcon = {
  dishes: BowlFood,
  shopping: Basket,
} satisfies Record<string, Icon>;

export const metaIcon = {
  spicy: Flame,
  tags: Tag,
  ingredients: Basket,
  steps: CookingPot,
} satisfies Record<string, Icon>;
