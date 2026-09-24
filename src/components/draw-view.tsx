"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { ArrowsClockwise, CookingPot, Plus, Sparkle } from "@phosphor-icons/react";
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

type CardItem =
  | { type: "cover"; id: string }
  | { type: "dish"; id: string; dish: Dish };

function pickRandomDishes(pool: Dish[], count: number): Dish[] {
  if (pool.length === 0) return [];
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, pool.length));
}

function StackedCard({
  card,
  index,
  total,
  exitDir,
  onSwipe,
  onOpen,
}: {
  card: CardItem;
  index: number;
  total: number;
  exitDir: number;
  onSwipe: (dir: "left" | "right") => void;
  onOpen: () => void;
}) {
  const isTop = index === 0;
  const isDraggingRef = useRef(false);
  const dragX = useMotionValue(0);
  const rotate = useTransform(dragX, [-240, 240], [-14, 14]);

  return (
    <motion.div
      initial={{
        scale: 0.88,
        y: 22,
        opacity: 0,
      }}
      animate={{
        scale: index === 0 ? 1 : index === 1 ? 0.94 : 0.88,
        y: index === 0 ? 0 : index === 1 ? 11 : 22,
        opacity: index === 0 ? 1 : index === 1 ? 0.88 : 0.45,
      }}
      exit={{
        x: exitDir * 360,
        rotate: exitDir * 16,
        opacity: 0,
        transition: { duration: 0.24, ease: [0.32, 0.72, 0, 1] },
      }}
      transition={{
        type: "spring",
        stiffness: 380,
        damping: 32,
        mass: 0.8,
      }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.75}
      onTouchStart={(e) => {
        // 当触摸发生在卡片上时，阻止边缘手势穿透到浏览器的前进/后退
        e.stopPropagation();
      }}
      onDragStart={() => {
        isDraggingRef.current = true;
      }}
      onDrag={(_, info) => {
        dragX.set(info.offset.x);
      }}
      onDragEnd={(_, info) => {
        dragX.set(0);
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 50);
        const swipeThreshold = 75;
        const velocityThreshold = 350;
        if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
          onSwipe("right");
        } else if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
          onSwipe("left");
        }
      }}
      onClick={() => {
        if (isDraggingRef.current) return;
        onOpen();
      }}
      className={cn(
        "absolute inset-x-0 top-0 cursor-pointer overflow-hidden rounded-2xl border bg-card text-left select-none will-change-transform",
        isTop
          ? "border-line shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] active:cursor-grabbing"
          : "border-line-2 shadow-sm pointer-events-none",
      )}
      style={{
        rotate: isTop ? rotate : 0,
        zIndex: 30 - index * 10,
        touchAction: "pan-y",
        overscrollBehaviorX: "none",
      }}
    >
      {card.type === "cover" ? (
        <>
          <div className="relative flex aspect-[16/10] w-full flex-col items-center justify-center overflow-hidden bg-paper-2">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(110% 80% at 50% 12%, rgba(161, 112, 47, 0.12), rgba(0,0,0,0) 72%)",
              }}
            />
            <div className="relative flex size-20 items-center justify-center rounded-full border border-caramel/25 bg-card/85 shadow-sm backdrop-blur-sm">
              <CookingPot size={38} weight="duotone" className="text-caramel" />
            </div>
            <p className="mt-3.5 font-display text-[21px] tracking-[0.2em] text-ink">
              今天吃什么
            </p>
            <p className="mt-1 text-[11.5px] tracking-wider text-ink-3">
              滑动卡片 · 开启今日菜单
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="truncate font-display text-[22px] leading-tight tracking-wider text-ink">
                开启灵感
              </h2>
              <span className="shrink-0 rounded-full bg-caramel-soft px-2.5 py-0.5 text-[10.5px] text-caramel">
                共 {total} 道精选
              </span>
            </div>
            <p className="mt-2 line-clamp-2 min-h-[38px] text-[12.5px] leading-relaxed text-ink-2">
              选择困难？轻滑卡片或点击「开始抽菜」，随机抽取今日三餐搭配灵感。
            </p>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-3">
              <span>左右滑卡换一道</span>
              <span className="text-line-2">/</span>
              <span>点击卡片看做法</span>
              <span className="ml-auto text-accent">轻触开始 →</span>
            </div>
          </div>
        </>
      ) : (
        (() => {
          const dish = card.dish;
          const t = catTheme[dish.category];
          return (
            <>
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-paper-2">
                <DishThumb
                  dish={dish}
                  className="size-full"
                  sizes="(max-width:520px) 100vw, 520px"
                  priority={isTop}
                  variant="lg"
                />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="truncate font-display text-[22px] leading-tight tracking-wider text-ink">
                    {dish.name}
                  </h2>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10.5px]",
                      t.bg,
                      t.text,
                    )}
                  >
                    {dish.tags[0] ?? "家常"}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 min-h-[38px] text-[12.5px] leading-relaxed text-ink-2">
                  {dish.desc}
                </p>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-3">
                  <span className="tabular-nums">{dish.minutes} 分钟</span>
                  <span className="text-line-2">/</span>
                  <span>{difficultyLabel[dish.difficulty]}</span>
                  <span className="text-line-2">/</span>
                  <span>{spicyLabel[dish.spicy]}</span>
                  <span className="ml-auto text-ink-3">点开看做法 →</span>
                </div>
              </div>
            </>
          );
        })()
      )}
    </motion.div>
  );
}

export function DrawView() {
  const [filter, setFilter] = useState<Filter>("all");
  const [exitDir, setExitDir] = useState<number>(1);
  const historyRef = useRef<string[]>([]);
  const idSeqRef = useRef(1);
  const isAnimatingRef = useRef(false);

  const add = useCart((s) => s.add);
  const locked = useCart((s) => s.locked);
  const openSheet = useDishSheet((s) => s.open);

  const pool = useMemo(
    () => (filter === "all" ? dishes : dishes.filter((d) => d.category === filter)),
    [filter],
  );

  const pickNextDish = useCallback(
    (customPool?: Dish[]) => {
      const p = customPool ?? pool;
      const recent = historyRef.current.slice(-Math.min(10, Math.max(1, p.length - 1)));
      const candidates = p.filter((d) => !recent.includes(d.id));
      const from = candidates.length > 0 ? candidates : p;
      const next = from[Math.floor(Math.random() * from.length)];
      historyRef.current.push(next.id);
      if (hasImage(next.id)) void preloadImage(next.image);
      return next;
    },
    [pool],
  );

  // 初始化卡片堆栈：封面卡 + 候选菜
  const [cards, setCards] = useState<CardItem[]>(() => {
    const picked = pickRandomDishes(dishes, 3);
    for (const d of picked) {
      if (hasImage(d.id)) void preloadImage(d.image);
    }
    return [
      { type: "cover", id: "cover" },
      ...picked.map((d, i) => ({
        type: "dish" as const,
        id: `init-${d.id}-${i + 1}`,
        dish: d,
      })),
    ];
  });

  // 分类切换
  const handleFilter = (fId: Filter) => {
    if (filter === fId) return;
    haptic(6);
    setFilter(fId);

    const newPool = fId === "all" ? dishes : dishes.filter((d) => d.category === fId);
    historyRef.current = [];

    const picked = pickRandomDishes(newPool, 3);
    for (const d of picked) {
      if (hasImage(d.id)) void preloadImage(d.image);
    }

    setCards((prev) => {
      const top = prev[0];
      const newDishCards: CardItem[] = picked.map((d) => ({
        type: "dish" as const,
        id: `f-${d.id}-${idSeqRef.current++}`,
        dish: d,
      }));

      if (top?.type === "cover") {
        return [top, ...newDishCards];
      }
      return newDishCards;
    });
  };

  const handleSwipe = useCallback(
    (dir: "left" | "right") => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      setTimeout(() => {
        isAnimatingRef.current = false;
      }, 240);

      haptic(15);
      setExitDir(dir === "left" ? -1 : 1);

      const nextDish = pickNextDish();
      setCards((prev) => [
        ...prev.slice(1),
        {
          type: "dish",
          id: `queue-${nextDish.id}-${idSeqRef.current++}`,
          dish: nextDish,
        },
      ]);
    },
    [pickNextDish],
  );

  const topCard = cards[0];
  const isCover = topCard?.type === "cover";

  const onAddAndContinue = useGuard(() => {
    if (!topCard || topCard.type !== "dish") return;
    if (locked) {
      toast("这一餐已经定了，想改先点「重新编辑」");
      return;
    }
    haptic(25);
    add(topCard.dish.id);
    toast(`已加入 · ${topCard.dish.name}`);
    handleSwipe("right");
  }, 350);

  const onOpenTop = () => {
    if (!topCard) return;
    if (topCard.type === "cover") {
      handleSwipe("right");
    } else {
      haptic(10);
      openSheet(topCard.dish.id);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col px-5 pt-4">
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
            onClick={() => handleFilter(f.id)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] transition",
              filter === f.id
                ? "border-accent bg-accent text-white"
                : "border-line bg-card text-ink-2",
            )}
          >
            {f.name}
          </button>
        ))}
      </div>

      {/* 堆叠卡片区 */}
      <div
        className="relative mt-6 flex-1 min-h-[380px]"
        style={{ overscrollBehaviorX: "none" }}
      >
        <AnimatePresence initial={false}>
          {cards.slice(0, 3).map((c, idx) => (
            <StackedCard
              key={c.id}
              card={c}
              index={idx}
              total={pool.length}
              exitDir={exitDir}
              onSwipe={handleSwipe}
              onOpen={onOpenTop}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* 操作底栏 */}
      <div className="sticky bottom-3 mt-5 flex gap-2.5 pb-3">
        {isCover ? (
          <button
            type="button"
            onClick={() => handleSwipe("right")}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-[14px] font-medium tracking-wide text-white shadow-sm transition active:scale-[0.98]"
          >
            <Sparkle size={18} weight="fill" />
            开始抽菜
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => handleSwipe("right")}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-line bg-card py-3.5 text-[14px] font-medium tracking-wide text-ink shadow-sm transition active:scale-[0.98]"
            >
              <ArrowsClockwise size={16} weight="bold" />
              换一道
            </button>
            <button
              type="button"
              onClick={onAddAndContinue}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-[14px] font-medium tracking-wide text-white shadow-sm transition active:scale-[0.98]"
            >
              <Plus size={16} weight="bold" />
              加入点菜单
            </button>
          </>
        )}
      </div>

      <DishSheet />
    </div>
  );
}
