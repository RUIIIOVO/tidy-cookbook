import Image from "next/image";
import type { Dish } from "@/data/types";
import { catTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** 配图还没生成完，先用「印章占位」——不是灰块，看起来是设计的一部分 */
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
      <span
        className={cn(
          "pointer-events-none absolute rounded-[4px] border",
          variant === "lg" ? "inset-3" : "inset-[6px]",
        )}
        style={{ borderColor: t.hex, opacity: 0.16 }}
      />
      <span
        className={cn(
          "vertical-zh font-display leading-none",
          variant === "lg" ? "text-[40px]" : "text-[19px]",
        )}
        style={{ color: t.hex, opacity: variant === "lg" ? 0.4 : 0.55 }}
      >
        {dish.name.slice(0, 2)}
      </span>
    </div>
  );
}
