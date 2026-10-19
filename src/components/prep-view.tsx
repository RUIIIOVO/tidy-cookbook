"use client";

import { useMemo, useState } from "react";
import { CookingPot, type Icon } from "@phosphor-icons/react";
import { motion, useMotionValueEvent, useTransform } from "motion/react";
import { prepTabIcon } from "@/lib/icons";
import { dayLabel, shortDate } from "@/lib/meal-time";
import { deleteMeal } from "@/lib/meal-actions";
import { usePrepUi, type PrepSeg } from "@/lib/prep-store";
import type { Meal } from "@/lib/protocol";
import { useCart } from "@/lib/store";
import { useMealsSplit } from "@/lib/use-meals";
import { useTabs } from "@/lib/tab-store";
import { ui } from "@/lib/ui";
import { cn, haptic } from "@/lib/utils";
import { MealTicket } from "./meal-ticket";
import { ShoppingList, useShoppingData } from "./shopping-list";
import { SwipePanels, usePager, type Pager } from "./swipe-panels";

/** 日期胶囊里「全部」的值 */
const ALL = "all";

const SEGS: PrepSeg[] = ["dishes", "shop"];

/**
 * 备菜页：就餐日期 >= 今天的订单。两个并排的视图——菜品（一餐一组）和买菜清单，
 * 顶部 iOS 分段控件切换，也可以左右滑动。
 * 订单编辑面板由 tabs-host 全局挂一份，这里只管 openMealEdit。
 */
export function PrepView() {
  // 过了饭点的那顿已经挪到订单页
  const { upcoming: meals } = useMealsSplit();
  const today = useCart((s) => s.today);
  const seg = usePrepUi((s) => s.seg);
  const setSeg = usePrepUi((s) => s.setSeg);
  // null = 没手动选过，用「最近要做的那天」
  const [picked, setPicked] = useState<string | null>(null);

  const index = SEGS.indexOf(seg);
  const pager = usePager(index);

  const sorted = useMemo(
    () =>
      [...meals].sort((a, b) =>
        a.mealDate === b.mealDate ? a.slot - b.slot : a.mealDate < b.mealDate ? -1 : 1,
      ),
    [meals],
  );
  const days = useMemo(() => [...new Set(sorted.map((m) => m.mealDate))], [sorted]);

  // 选中的那天没订单了（被删 / 过了切日点）就回到最近那天
  const day = picked === ALL ? ALL : picked && days.includes(picked) ? picked : (days[0] ?? ALL);
  const shown = useMemo(
    () => (day === ALL ? sorted : sorted.filter((m) => m.mealDate === day)),
    [sorted, day],
  );

  const shop = useShoppingData(shown);

  if (sorted.length === 0) {
    return (
      <div className="flex min-h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] flex-col px-4 pt-4">
        <header>
          <h1 className="font-display text-[22px] tracking-wider text-ink">备菜</h1>
        </header>
        <div className="flex flex-1 items-center justify-center pb-16">
          <Empty />
        </div>
      </div>
    );
  }

  const dishCount = shown.reduce((n, m) => n + m.items.length, 0);
  const label = (d: string) => dayLabel(d, today) ?? shortDate(d);

  const pick = (i: number) => {
    if (i === index) return;
    haptic(6);
    pager.snapTo(i);
    setSeg(SEGS[i]);
  };

  return (
    // 至少铺满到底栏上方，面板内容短时下面的空白也在滑动区里
    <div className="flex min-h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] flex-col">
      <header className="px-4 pt-4 pb-1">
        <h1 className="font-display text-[22px] tracking-wider text-ink">备菜</h1>
        <p className="mt-1 text-[12px] text-ink-3">
          <span className="tabular-nums text-ink-2">{shown.length}</span> 餐 ·{" "}
          <span className="tabular-nums text-ink-2">{dishCount}</span> 道菜
        </p>
      </header>

      {/* 吸顶：分段控件 + 日期筛选，同时作用于两个视图 */}
      <div className="sticky top-0 z-20 bg-paper/90 backdrop-blur-lg hairline-b">
        <PrepSegmented
          pager={pager}
          index={index}
          onPick={pick}
          items={[
            { text: "菜品", Icon: prepTabIcon.dishes, badge: String(dishCount) },
            {
              text: "买菜清单",
              Icon: prepTabIcon.shopping,
              badge: shop.total > 0 ? `${shop.done}/${shop.total}` : undefined,
            },
          ]}
        />
        {days.length > 1 && (
          <div
            role="radiogroup"
            aria-label="按天筛选"
            className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-0.5 pb-2.5"
          >
            {[ALL, ...days].map((d) => {
              const on = d === day;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    if (on) return;
                    haptic(6);
                    setPicked(d);
                  }}
                  className={cn(
                    ui.chip,
                    on ? ui.chipOn : ui.chipOff,
                  )}
                >
                  {d === ALL ? "全部" : label(d)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <SwipePanels
        className="flex-1"
        pager={pager}
        index={index}
        onIndexChange={(i) => setSeg(SEGS[i])}
        panels={[
          <div key="dishes" className="px-4 pt-3 pb-8">
            <DishGroups meals={shown} />
          </div>,
          <div key="shop" className="px-4 pt-3 pb-8">
            <ShoppingList meals={shown} />
          </div>,
        ]}
      />
    </div>
  );
}

/** iOS 分段控件：整宽轨道 + 白色滑块；滑块直接订阅手势进度，跟手平移 */
function PrepSegmented({
  pager,
  index,
  onPick,
  items,
}: {
  pager: Pager;
  index: number;
  onPick: (i: number) => void;
  items: { text: string; Icon: Icon; badge?: string }[];
}) {
  // 手势拖过一半时文字就切到新页的强调态，不必等松手
  const [near, setNear] = useState(index);
  useMotionValueEvent(pager.pos, "change", (v) => setNear(v >= 0.5 ? 1 : 0));
  // 滑块宽度 = 一格宽，平移 pos × 自身宽度
  const thumbX = useTransform(pager.pos, (p) => `${p * 100}%`);

  return (
    <div className="px-4 pt-2 pb-2.5">
      <div
        role="tablist"
        aria-label="备菜视图"
        className="relative grid h-9 grid-cols-2 rounded-[10px] bg-paper-2 p-0.5"
      >
        <motion.div
          aria-hidden
          style={{ x: thumbX }}
          className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-lg bg-card shadow-2xs"
        />
        {items.map((it, i) => (
          <button
            key={it.text}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => onPick(i)}
            className={cn(
              "relative z-10 inline-flex items-center justify-center gap-1.5 text-[13px] transition-colors active:opacity-60",
              i === near ? "font-medium text-ink" : "text-ink-3",
            )}
          >
            <it.Icon size={15} weight={i === near ? "fill" : "regular"} className="shrink-0" />
            {it.text}
            {it.badge && (
              <span className="ml-1 font-normal tabular-nums text-ink-3">{it.badge}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 菜品视图：一餐一张订单卡，和订单页同一套小票 */
function DishGroups({ meals }: { meals: Meal[] }) {
  return (
    <div className="flex flex-col gap-3">
      {meals.map((meal) => (
        <MealTicket
          key={meal.id}
          meal={meal}
          dishFocus="ingredients"
          onDelete={async () => (await deleteMeal({ mealId: meal.id, date: meal.mealDate })).ok}
        />
      ))}
    </div>
  );
}

function Empty() {
  const setActiveTab = useTabs((s) => s.setActiveTab);
  return (
    <div className="flex flex-col items-center justify-center px-8 text-center">
      <p className="font-display text-[18px] tracking-wider text-ink">
        大厨摸鱼中
        <span className="ml-1.5 select-none" role="img" aria-label="鱼">
          🐟
        </span>
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
        快去下单吧，大厨随时火力全开！
      </p>
      <button
        type="button"
        onClick={() => {
          haptic(6);
          setActiveTab("cart");
        }}
        className="mt-6 flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-[13px] text-white transition active:scale-[0.97]"
      >
        <CookingPot size={15} weight="regular" />
        去下单
      </button>
    </div>
  );
}
