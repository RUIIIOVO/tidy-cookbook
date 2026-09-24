import type { CategoryId } from "@/data/types";

export const catTheme: Record<
  CategoryId,
  { text: string; bg: string; border: string; dot: string; hex: string }
> = {
  meat: {
    text: "text-chili",
    bg: "bg-chili-soft",
    border: "border-chili/25",
    dot: "bg-chili",
    hex: "#a4381f",
  },
  seafood: {
    text: "text-brine",
    bg: "bg-brine-soft",
    border: "border-brine/25",
    dot: "bg-brine",
    hex: "#2f5a61",
  },
  veggie: {
    text: "text-leaf",
    bg: "bg-leaf-soft",
    border: "border-leaf/25",
    dot: "bg-leaf",
    hex: "#576b48",
  },
  staple: {
    text: "text-caramel",
    bg: "bg-caramel-soft",
    border: "border-caramel/25",
    dot: "bg-caramel",
    hex: "#a1702f",
  },
  dessert: {
    text: "text-caramel",
    bg: "bg-caramel-soft",
    border: "border-caramel/25",
    dot: "bg-caramel",
    hex: "#a1702f",
  },
  diet: {
    text: "text-leaf",
    bg: "bg-leaf-soft",
    border: "border-leaf/25",
    dot: "bg-leaf",
    hex: "#576b48",
  },
};

export const spicyLabel = ["不辣", "微辣", "中辣", "很辣"];
export const difficultyLabel = ["", "简单", "中等", "有点难"];
