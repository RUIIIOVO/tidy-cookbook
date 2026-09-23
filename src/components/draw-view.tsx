"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowsClockwise, Shuffle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { categories, dishes } from "@/data/dishes";
import type { CategoryId, Dish } from "@/data/types";
import { catTheme, difficultyLabel, spicyLabel } from "@/lib/theme";
import { hasImage, preloadImage } from "@/lib/images";
import { useCart } from "@/lib/store";
import { useGuard } from "@/lib/use-guard";
import { useDishSheet } from "@/lib/ui-store";
import { cn, haptic } from "@/lib/utils";
import { DishSheet } from "./dish-sheet";
import { DishThumb } from "./dish-thumb";

type Filter = "all" | CategoryId;

const FILTERS: { id: Filter; name: string }[] = [
  { id: "all", name: "全部" },
  ...categories.map((c) => ({ id: c.id as Filter, name: c.name })),
];

const TICKS = [55, 55, 60, 65, 75, 90, 110, 135, 165, 200];
const IMAGE_WAIT_MAX = 2500;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function DrawView() {
  const [filter, setFilter] = useState<Filter>("all");
  const [dish, setDish] = useState<Dish | null>(null);
  const [rolling, setRolling] = useState(false);
  /** 滚动中跳动的菜名，只动文字；图片等揭晓时和文字一起换 */
  const [ticker, setTicker] = useState<string | null>(null);
  const historyRef = useRef<string[]>([]);
  /** 下一次要揭晓的菜，提前选好并预加载配图，点下去时图基本已经在缓存里 */
  const nextRef = useRef<Dish | null>(null);
  const aliveRef = useRef(true);
  const add = useCart((s) => s.add);
  const locked = useCart((s) => s.locked);
  const openSheet = useDishSheet((s) => s.open);

  const pool = useMemo(
    () => (filter === "all" ? dishes : dishes.filter((d) => d.category === filter)),
    [filter],
  );

  const pick = useCallback(() => {
    const recent = historyRef.current.slice(-Math.min(8, pool.length - 1));
    const candidates = pool.filter((d) => !recent.includes(d.id));
    const from = candidates.length ? candidates : pool;
    const next = from[Math.floor(Math.random() * from.length)];
    if (hasImage(next.id)) void preloadImage(next.image);
    return next;
  }, [pool]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // 换分类或首屏时预选一道
  useEffect(() => {
    nextRef.current = pick();
  }, [pick]);

  const rollingRef = useRef(false);
  const roll = async () => {
    // 用 ref 挡：连点两下时第二下拿到的 rolling 还是旧值
    if (rollingRef.current) return;
    rollingRef.current = true;
    haptic(15);
    setRolling(true);

    const target =
      nextRef.current && pool.includes(nextRef.current) ? nextRef.current : pick();
    const imageReady = hasImage(target.id)
      ? Promise.race([preloadImage(target.image), sleep(IMAGE_WAIT_MAX)])
      : Promise.resolve();

    // 第一次抽：先把一张随机菜放进卡片，让 UI 从空白态过渡到卡片态
    // 之后的流程和"换一道"完全一致，没有割裂感
    if (!dish) {
      const seed = pool[Math.floor(Math.random() * pool.length)];
      setDish(seed);
      await sleep(60); // 让 React 把卡片渲染出来
    }

    // 越跳越慢，像老虎机停下来
    for (const ms of TICKS) {
      if (!aliveRef.current) return;
      setTicker(pool[Math.floor(Math.random() * pool.length)].name);
      await sleep(ms);
    }
    await imageReady;
    if (!aliveRef.current) return;

    setDish(target);
    setTicker(null);
    setRolling(false);
    rollingRef.current = false;
    historyRef.current.push(target.id);
    haptic(25);
    nextRef.current = pick();
  };

  const pickIt = useGuard(() => {
    if (!dish) return;
    if (locked) {
      toast("这一餐已经定了，想改先点「重新编辑」");
      return;
    }
    haptic();
    add(dish.id);
    toast(`已加入 · ${dish.name}`);
  }, 800);

  const t = dish ? catTheme[dish.category] : catTheme.meat;

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col px-5 pt-16">
      <header>
        <p className="text-[11px] tracking-[0.3em] text-ink-3">TODAY&apos;S PICK</p>
        <h1 className="mt-1.5 font-display text-[28px] leading-tight tracking-wider text-ink">
          今天吃什么
        </h1>
      </header>

      <div className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            disabled={rolling}
            onClick={() => {
              haptic(6);
              setFilter(f.id);
            }}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] transition disabled:opacity-60",
              filter === f.id
                ? "border-accent bg-accent text-white"
                : "border-line bg-card text-ink-2",
            )}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className="mt-6 flex-1">
        {dish ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => !rolling && openSheet(dish.id)}
            onKeyDown={(e) => e.key === "Enter" && !rolling && openSheet(dish.id)}
            className="block w-full cursor-pointer overflow-hidden rounded-2xl border border-line bg-card text-left"
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-paper-2">
              <AnimatePresence initial={false}>
                <motion.div
                  key={dish.id}
                  initial={{ opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.38, ease: [0.22, 0.61, 0.36, 1] }}
                  className="absolute inset-0"
                >
                  <DishThumb
                    dish={dish}
                    className="size-full"
                    sizes="100vw"
                    priority
                    variant="lg"
                  />
                </motion.div>
              </AnimatePresence>
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 bg-card/40 backdrop-blur-md transition-opacity duration-200",
                  rolling ? "opacity-100" : "opacity-0",
                )}
              />
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="truncate font-display text-[22px] leading-tight tracking-wider text-ink">
                  {ticker ?? dish.name}
                </h2>
                <span
                  className={cn(
                    `shrink-0 rounded-full px-2 py-0.5 text-[10.5px] transition-opacity ${t.bg} ${t.text}`,
                    rolling && "opacity-0",
                  )}
                >
                  {dish.tags[0] ?? "家常"}
                </span>
              </div>
              <div className={cn("transition-opacity duration-200", rolling && "opacity-30")}>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{dish.desc}</p>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-3">
                  <span className="tabular-nums">{dish.minutes} 分钟</span>
                  <span className="text-line-2">/</span>
                  <span>{difficultyLabel[dish.difficulty]}</span>
                  <span className="text-line-2">/</span>
                  <span>{spicyLabel[dish.spicy]}</span>
                  <span className="ml-auto text-ink-3">点开看做法 →</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-line-2 text-center">
            <Shuffle size={32} weight="light" className="text-line-2" />
            <p className="mt-3 px-8 font-display text-[15px] leading-relaxed tracking-wider text-ink-3">
              今个又不知道吃啥了？抽一发试试
            </p>
            <p className="mt-1 text-[11px] text-ink-3">
              共 <span className="tabular-nums">{pool.length}</span> 道可选
            </p>
          </div>
        )}
      </div>

      <div className="sticky bottom-3 mt-5 flex gap-2.5 pb-3">
        <button
          type="button"
          onClick={() => void roll()}
          disabled={rolling}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-[14px] tracking-wide text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          <ArrowsClockwise
            size={16}
            weight="regular"
            className={rolling ? "animate-spin" : ""}
          />
          {dish ? "换一道" : "开始抽菜"}
        </button>
        {dish && (
          <button
            type="button"
            onClick={pickIt}
            disabled={rolling}
            className="rounded-full border border-accent/30 bg-accent-soft px-6 py-3.5 text-[14px] tracking-wide text-accent transition active:scale-[0.98] disabled:opacity-50"
          >
            加入点菜单
          </button>
        )}
      </div>

      <DishSheet />
    </div>
  );
}
