"use client";

import Image from "next/image";
import type { Dish } from "@/data/types";
import { subIcon } from "@/lib/icons";
import { catTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** 配图还没生成完；占位用分类图标，不是灰块 */
export const IMAGES_READY = false;

export function DishThumb({
  dish,
  className,
  sizes = "112px",
  priority,
  variant = "sm",
}: {
  dish: Dish;
  className?: string;
  sizes?: string;
  priority?: boolean;
  variant?: "sm" | "lg";
}) {
  const t = catTheme[dish.category];
  const Icon = subIcon[dish.sub];

  if (IMAGES_READY) {
    return (
      <div className={cn("relative overflow-hidden bg-paper-2", className)}>
        <Image
          src={dish.image}
          alt={dish.name}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden",
        t.bg,
        className,
      )}
    >
      <Icon
        size={variant === "lg" ? 56 : 26}
        weight="duotone"
        color={t.hex}
        style={{ opacity: variant === "lg" ? 0.34 : 0.5 }}
      />
      {variant === "lg" && (
        <span
          className="absolute bottom-3 left-3 text-[10px] tracking-[0.3em]"
          style={{ color: t.hex, opacity: 0.4 }}
        >
          配图生成中
        </span>
      )}
    </div>
  );
}
