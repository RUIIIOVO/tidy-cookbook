"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { ArrowsClockwise, Plus, Trophy } from "@phosphor-icons/react";
import { toast } from "sonner";
import { categories, dishes } from "@/data/dishes";
import type { CategoryId, Dish } from "@/data/types";
import { catTheme, spicyLabel } from "@/lib/theme";
import { hasImage, preloadImage } from "@/lib/images";
import { useCart } from "@/lib/store";
import { useDishRatings } from "@/lib/dish-rating-store";
import { useGuard } from "@/lib/use-guard";
import { useTabs } from "@/lib/tab-store";
import { useDishSheet } from "@/lib/ui-store";
import { cn, haptic } from "@/lib/utils";
import { DishThumb } from "./dish-thumb";
import { Leaderboard } from "./leaderboard";
import { RatingBadge } from "./rating-badge";

type Filter = "all" | CategoryId;

const FILTERS: { id: Filter; name: string }[] = [
  { id: "all", name: "全部" },
  ...categories.map((c) => ({ id: c.id as Filter, name: c.name })),
];

type CardItem = { id: string; seq: number; dish: Dish };

const PEEK = 14;
const FULL_DRAG = 140;
const HINT_KEY = "tc-swipe-hint";

function pickRandomDishes(pool: Dish[], count: number): Dish[] {
  if (pool.length === 0) return [];
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, pool.length));
}

/** 一张菜品卡的正面：大图 + 名字 / 描述 / 评分 · 点过几次 · 辣度（高屏再多一行主料） */
function DishFace({ dish, priority }: { dish: Dish; priority: boolean }) {
  const t = catTheme[dish.category];
  const count = useCart((s) => s.stats[dish.id] || 0);
  const main = dish.ingredients.find((g) => g.group === "主料")?.items.slice(0, 4).map((i) => i.name);
  return (
    <>
      <div className="relative min-h-[120px] w-full flex-1 overflow-hidden bg-paper-2">
        <DishThumb
          dish={dish}
          className="size-full"
          sizes="(max-width:520px) 100vw, 520px"
          priority={priority}
          variant="lg"
        />
      </div>
      <div className="shrink-0 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="truncate font-display text-[22px] leading-tight tracking-wider text-ink">
            {dish.name}
          </h2>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px]", t.bg, t.text)}>
            {dish.tags[0] ?? "家常"}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 min-h-[41px] text-[12.5px] leading-relaxed text-ink-2">
          {dish.desc}
        </p>
        {main && main.length > 0 && (
          <p className="mt-2 hidden truncate text-[11.5px] text-ink-3 [@media(min-height:820px)]:block">
            主料 · {main.join("、")}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-3">
          <RatingBadge dishId={dish.id} />
          {count > 0 && (
            <span className="rounded-full bg-caramel-soft px-2 py-0.5 text-[10px] font-medium text-caramel tabular-nums">
              点过 {count} 次
            </span>
          )}
          <span>{spicyLabel[dish.spicy]}</span>
          <span className="ml-auto">查看详情 →</span>
        </div>
      </div>
    </>
  );
}

function StackedCard({
  card,
  index,
  pos,
  exitDir,
  onSwipe,
  onDragProgress,
  onDragCancel,
  onOpen,
}: {
  card: CardItem;
  index: number;
  pos: MotionValue<number>;
  exitDir: number;
  onSwipe: (dir: "left" | "right") => void;
  onDragProgress: (p: number) => void;
  onDragCancel: () => void;
  onOpen: () => void;
}) {
  const isTop = index === 0;
  const isDraggingRef = useRef(false);
  const x = useMotionValue(0);
  const dragRotate = useTransform(x, [-240, 240], [-10, 10]);
  const hintRef = useRef<ReturnType<typeof animate> | null>(null);

  const depth = useTransform(pos, (v) => Math.max(0, card.seq - v));
  const scale = useTransform(depth, [0, 1, 2, 3], [1, 0.95, 0.9, 0.85]);
  const y = useTransform(depth, [0, 1, 2, 3], [0, PEEK, PEEK * 2, PEEK * 3]);

  // 方案 C：同向阶梯微旋转（规则递增，0° -> 2° -> 4°）
  const slotRotate = useTransform(depth, [0, 1, 2, 3], [0, 2, 4, 5.5]);
  const tint = useTransform(depth, [0, 1, 2], [0, 0.55, 0.9]);
  const appear = useTransform(depth, [2, 3], [1, 0]);

  useEffect(() => {
    if (!isTop) return;
    try {
      if (localStorage.getItem(HINT_KEY)) return;
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      return;
    }
    hintRef.current = animate(x, [0, -22, 16, 0], { duration: 1.1, delay: 0.9, ease: "easeInOut" });
    return () => hintRef.current?.stop();
  }, [isTop, x]);

  return (
    <motion.div
      exit={{
        x: exitDir * 360,
        rotate: exitDir * 14,
        opacity: 0,
        transition: { duration: 0.24, ease: [0.32, 0.72, 0, 1] },
      }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.75}
      onTouchStart={(e) => {
        e.stopPropagation();
      }}
      onDragStart={() => {
        hintRef.current?.stop();
        isDraggingRef.current = true;
      }}
      onDrag={(_, info) => onDragProgress(Math.min(1, Math.abs(info.offset.x) / FULL_DRAG))}
      onDragEnd={(_, info) => {
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 50);
        const swipeThreshold = 75;
        const velocityThreshold = 350;
        if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
          onSwipe("right");
        } else if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
          onSwipe("left");
        } else {
          onDragCancel();
        }
      }}
      onClick={() => {
        if (isDraggingRef.current) return;
        onOpen();
      }}
      className={cn(
        "absolute inset-x-0 top-0 cursor-pointer select-none will-change-transform",
        isTop ? "active:cursor-grabbing" : "pointer-events-none",
      )}
      style={{
        bottom: PEEK * 2,
        x,
        rotate: isTop ? dragRotate : 0,
        transformOrigin: "50% 100%",
        zIndex: 30 - index * 10,
        touchAction: "pan-y",
        overscrollBehaviorX: "none",
      }}
    >
      <motion.div
        style={{ scale, y, rotate: slotRotate, opacity: appear, transformOrigin: "50% 100%" }}
        className={cn(
          "relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card text-left",
          isTop
            ? "border-line shadow-[0_8px_24px_-8px_rgba(0,0,0,0.14)]"
            : "border-line-2 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.12)]",
        )}
      >
        <DishFace dish={card.dish} priority={isTop} />
        <motion.span
          aria-hidden
          style={{ opacity: tint }}
          className="pointer-events-none absolute inset-0 bg-paper-2"
        />
      </motion.div>
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
  const openSheet = useDishSheet((s) => s.open);

  const refreshRatings = useDishRatings((s) => s.refresh);
  useEffect(() => {
    void refreshRatings();
  }, [refreshRatings]);

  const setActiveTab = useTabs((s) => s.setActiveTab);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardMounted, setBoardMounted] = useState(false);
  const pendingTab = useRef<"cart" | null>(null);

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

  const [cards, setCards] = useState<CardItem[]>(() => {
    const picked = pickRandomDishes(dishes, 3);
    for (const d of picked) {
      if (hasImage(d.id)) void preloadImage(d.image);
    }
    return picked.map((d, i) => ({ id: `init-${d.id}-${i + 1}`, seq: i, dish: d }));
  });

  const nextSeqRef = useRef(3);
  const pos = useMotionValue(0);
  const posAnim = useRef<ReturnType<typeof animate> | null>(null);
  const topSeq = cards[0]?.seq ?? 0;

  useEffect(() => {
    posAnim.current?.stop();
    if (Math.abs(pos.get() - topSeq) > 1.5) {
      pos.set(topSeq);
      return;
    }
    posAnim.current = animate(pos, topSeq, { type: "spring", stiffness: 380, damping: 32, mass: 0.8 });
    return () => posAnim.current?.stop();
  }, [topSeq, pos]);

  const onDragProgress = useCallback(
    (p: number) => {
      posAnim.current?.stop();
      pos.set(topSeq + p);
    },
    [pos, topSeq],
  );

  const onDragCancel = useCallback(() => {
    posAnim.current?.stop();
    posAnim.current = animate(pos, topSeq, { type: "spring", stiffness: 380, damping: 32, mass: 0.8 });
  }, [pos, topSeq]);

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

    setCards(
      picked.map((d) => ({
        id: `f-${d.id}-${idSeqRef.current++}`,
        seq: nextSeqRef.current++,
        dish: d,
      })),
    );
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
        { id: `queue-${nextDish.id}-${idSeqRef.current++}`, seq: nextSeqRef.current++, dish: nextDish },
      ]);
    },
    [pickNextDish],
  );

  const topCard = cards[0];

  const onAdd = useGuard(() => {
    if (!topCard) return;
    haptic(25);
    add(topCard.dish.id);
    toast(`已加入 · ${topCard.dish.name}`);
  }, 350);

  const onOpenTop = () => {
    if (!topCard) return;
    haptic(10);
    openSheet(topCard.dish.id);
  };

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] flex-col px-5 pt-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[22px] tracking-wider text-ink">今天吃什么</h1>
        <button
          type="button"
          onClick={() => {
            haptic(6);
            setBoardMounted(true);
            setBoardOpen(true);
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card py-1.5 pr-3.5 pl-3 text-[12.5px] text-ink-2 transition active:scale-95"
        >
          <Trophy size={15} className="text-caramel" />
          排行榜
        </button>
      </header>

      <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
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

      <div className="flex min-h-[340px] flex-1 flex-col justify-center py-3">
        <div
          className="relative w-full flex-1 [--text-h:141px] [@media(min-height:820px)]:[--text-h:169px]"
          style={{
            maxHeight: `calc(min(100vw, 520px) - 40px + var(--text-h) + ${PEEK * 2}px)`,
            overscrollBehaviorX: "none",
          }}
        >
          <AnimatePresence initial={false}>
            {cards.slice(0, 3).map((c, idx) => (
              <StackedCard
                key={c.id}
                card={c}
                index={idx}
                pos={pos}
                exitDir={exitDir}
                onSwipe={handleSwipe}
                onDragProgress={onDragProgress}
                onDragCancel={onDragCancel}
                onOpen={onOpenTop}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] flex gap-2.5 pb-3">
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
          onClick={onAdd}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-[14px] font-medium tracking-wide text-white shadow-sm transition active:scale-[0.98]"
        >
          <Plus size={16} weight="bold" />
          加入点菜单
        </button>
      </div>

      {boardMounted &&
        createPortal(
          <AnimatePresence
            onExitComplete={() => {
              if (pendingTab.current) {
                const t = pendingTab.current;
                pendingTab.current = null;
                setTimeout(() => setActiveTab(t), 150);
              }
            }}
          >
            {boardOpen && (
              <Leaderboard
                onClose={() => setBoardOpen(false)}
                onGoCart={() => {
                  pendingTab.current = "cart";
                  setBoardOpen(false);
                }}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
