import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function haptic(ms = 12) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  // 没有用户激活时调用会被浏览器拒绝并打印警告，这里先自查
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate(ms);
  } catch {}
}

/** 规范化用户展示名：客人统一称为「食客」 */
export function formatPersonName(name?: string | null): string {
  if (!name) return "";
  const t = name.trim();
  if (t.toLowerCase() === "guest" || t === "小客") return "食客";
  return t;
}

