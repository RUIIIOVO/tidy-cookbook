"use client";

import { useState } from "react";
import Image from "next/image";
import type { Dish } from "@/data/types";
import { hasImage, isDecoded, markDecoded } from "@/lib/images";
import { subIcon } from "@/lib/icons";
import { catTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

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
  const alreadyCached = isDecoded(dish.image);
  // 记录已加载失败的 src，失败时直接回落到分类图标占位，禁止显示破损图片
  const [errorSrc, setErrorSrc] = useState<string | null>(null);
  const isError = errorSrc === dish.image;
  // 记录已加载完的 src；如果全局已解码过且未失败，认定已加载
  const [loadedSrc, setLoadedSrc] = useState<string | null>(
    alreadyCached && !isError ? dish.image : null,
  );
  const loaded = (loadedSrc === dish.image || alreadyCached) && !isError;

  if (hasImage(dish.id) && !isError) {
    return (
      <div className={cn("relative overflow-hidden bg-paper-2", className)}>
        {!loaded && <span aria-hidden className="shimmer absolute inset-0" />}
        <Image
          src={dish.image}
          alt={dish.name}
          fill
          sizes={sizes}
          priority={priority}
          onLoad={() => {
            markDecoded(dish.image);
            setLoadedSrc(dish.image);
          }}
          onError={() => setErrorSrc(dish.image)}
          className={cn(
            "object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    );
  }

  if (variant === "sm") {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden",
          t.bg,
          className,
        )}
      >
        <Icon size={24} weight="light" color={t.hex} style={{ opacity: 0.55 }} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center gap-3.5 overflow-hidden",
        t.bg,
        className,
      )}
    >
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(110% 80% at 50% 8%, rgba(255,255,255,0.7), rgba(255,255,255,0) 68%)",
        }}
      />
      <div
        className="relative grid size-[88px] place-items-center rounded-full"
        style={{ border: `1px solid ${t.hex}22`, background: "rgba(255,255,255,0.42)" }}
      >
        <Icon size={36} weight="light" color={t.hex} style={{ opacity: 0.6 }} />
      </div>
      <span
        className="relative text-[9.5px] tracking-[0.36em]"
        style={{ color: t.hex, opacity: 0.45 }}
      >
        配图生成中
      </span>
    </div>
  );
}
