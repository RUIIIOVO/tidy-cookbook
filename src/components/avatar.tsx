import { cn } from "@/lib/utils";

/** 首字母圆形头像。名字多为 rui / hui 这类拼音，取首字母大写；中文名取第一个字。 */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const ch = [...name.trim()][0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[14px] shrink-0 place-items-center rounded-full bg-accent-soft text-[8.5px] leading-none font-medium text-accent",
        className,
      )}
    >
      {ch}
    </span>
  );
}
