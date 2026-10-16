"use client";

import { useEffect, useMemo, useState } from "react";
import { isMealOver } from "./meal-time";
import type { Meal } from "./protocol";
import { useCart } from "./store";

/** 每分钟刷新一次的当前时间，用来让「过了饭点」的订单按时挪走 */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    const onVisible = () => document.visibilityState === "visible" && setNow(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}

/**
 * 快照里的订单（就餐日期 >= 今天）按饭点拆成两组：
 * - upcoming：还没到饭点结束，显示在备菜页、算进买菜清单
 * - finishedToday：今天已经过了饭点的，显示在订单页最上面（按时间倒序）
 */
export function useMealsSplit(): { upcoming: Meal[]; finishedToday: Meal[] } {
  const meals = useCart((s) => s.meals);
  const today = useCart((s) => s.today);
  const now = useMinuteClock();
  return useMemo(() => {
    const upcoming: Meal[] = [];
    const finishedToday: Meal[] = [];
    for (const m of meals) {
      (isMealOver(m.mealDate, m.slot, now, today) ? finishedToday : upcoming).push(m);
    }
    finishedToday.sort((a, b) => b.slot - a.slot);
    return { upcoming, finishedToday };
  }, [meals, today, now]);
}
