"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { ArrowsClockwise, Plus, Trophy } from "@phosphor-icons/react";
import { toast } from "sonner";
import { categories, dishes } from "@/data/dishes";
import type { CategoryId, Dish } from "@/data/types";
import { catTheme, spicyLabel } from "@/lib/theme";
import { hasImage, preloadImage } from "@/lib/images";
import { useCart } from "@/lib/store";
import { useDishRatings } from "@/lib/dish-rating-store";
import { useTabs } from "@/lib/tab-store";
import { useGuard } from "@/lib/use-guard";
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

type CardItem = { id: string; dish: Dish };

function pickRandomDishes(pool: Dish[], count: number): Dish[] {
  if (pool.length === 0) return [];
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, pool.length));
}

/** 第一次用时让顶牌轻轻晃一下，提示可以左右滑；之后不再出现（记在本机） */
const HINT_KEY = "tc-swipe-hint";

/** 一张菜品卡的正面：大图 + 名字 / 描述 / 评分 · 点过几次 · 辣度 */
function DishFace({ dish, priority }: { dish: Dish; priority: boolean }) {
  const t = catTheme[dish.category];
  const count = useCart((s) => s.stats[dish.id] || 0);
  return (
    <>
      <div className="relative aspect-[4/3] max-h-[272px] w-full overflow-hidden bg-paper-2 [@media(max-height:720px)]:aspect-[16/10]">
        <DishThumb
          dish={dish}
          className="size-full"
          sizes="(max-width:520px) 100vw, 520px"
          priority={priority}
          variant="lg"
        />
      </div>
      <div className="p-4">
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
  exitDir,
  onSwipe,
  onOpen,
}: {
  card: CardItem;
  index: number;
  exitDir: number;
  onSwipe: (dir: "left" | "right") => void;
  onOpen: () => void;
}) {
  const isTop = index === 0;
  const isDraggingRef = useRef(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-10, 10]);
  const hintRef = useRef<ReturnType<typeof animate> | null>(null);

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
      initial={{ scale: 0.9, y: 24, opacity: 0 }}
      // 叠牌：后面两层围绕底边缩小，露出一道边，一眼看出还有牌
      animate={{
        scale: index === 0 ? 1 : index === 1 ? 0.95 : 0.9,
        y: index === 0 ? 0 : index === 1 ? 12 : 24,
        opacity: index === 0 ? 1 : index === 1 ? 1 : 0.85,
      }}
      exit={{
        x: exitDir * 360,
        rotate: exitDir * 14,
        opacity: 0,
        transition: { duration: 0.24, ease: [0.32, 0.72, 0, 1] },
      }}
      transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.75}
      onTouchStart={(e) => {
        // 当触摸发生在卡片上时，阻止边缘手势穿透到浏览器的前进/后退
        e.stopPropagation();
      }}
      onDragStart={() => {
        hintRef.current?.stop();
        isDraggingRef.current = true;
      }}
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
          : "pointer-events-none border-line-2 shadow-sm",
      )}
      style={{
        x,
        rotate: isTop ? rotate : 0,
        transformOrigin: "50% 100%",
        zIndex: 30 - index * 10,
        touchAction: "pan-y",
        overscrollBehaviorX: "none",
      }}
    >
      <DishFace dish={card.dish} priority={isTop} />
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

  // 排行榜（全屏子页面）。首次打开前不挂 Portal，避免服务端预渲染时访问 document
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

  // 初始化卡片堆栈：直接就是候选菜，不再有封面
  const [cards, setCards] = useState<CardItem[]>(() => {
    const picked = pickRandomDishes(dishes, 3);
    for (const d of picked) {
      if (hasImage(d.id)) void preloadImage(d.image);
    }
    return picked.map((d, i) => ({ id: `init-${d.id}-${i + 1}`, dish: d }));
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

    setCards(
      picked.map((d) => ({
        id: `f-${d.id}-${idSeqRef.current++}`,
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
        { id: `queue-${nextDish.id}-${idSeqRef.current++}`, dish: nextDish },
      ]);
    },
    [pickNextDish],
  );

  const topCard = cards[0];

  // 加入后停在当前这道，不再自动换下一道；想换再点「换一道」
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
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col px-5 pt-4">
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

      {/* 叠牌区：下面留 24px 给后两层露出的边 */}
      <div className="relative mt-5 mb-6 min-h-[440px] flex-1 [@media(max-height:720px)]:min-h-[385px]" style={{ overscrollBehaviorX: "none" }}>
        <AnimatePresence initial={false}>
          {cards.slice(0, 3).map((c, idx) => (
            <StackedCard
              key={c.id}
              card={c}
              index={idx}
              exitDir={exitDir}
              onSwipe={handleSwipe}
              onOpen={onOpenTop}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* 操作底栏 */}
      {/* 吸底位置要躲开底部导航（3.5rem + 安全区），不然小屏内容溢出时按钮会钻到导航下面 */}
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
            // 关闭动画结束、排行榜卸载（它的返回历史记录也退掉了）之后，再切到点菜单
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
