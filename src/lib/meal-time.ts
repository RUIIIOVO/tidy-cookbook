/**
 * 就餐日期与餐别的唯一规则来源。Worker 和前端共用，这里不能依赖浏览器或 Worker 专有 API。
 *
 * - 数据库只存具体日期 `meal_date`（'YYYY-MM-DD'，北京时间）和餐别 `slot`（1~4）。
 *   「昨天 / 今天 / 明天 / 后天」只是界面文字，由 dayLabel() 现算。
 * - 一天从北京时间凌晨 4 点开始：凌晨 1 点吃的宵夜算前一天。
 * - 「今天」以服务端快照下发的 today 为准，前端不信本机时钟。
 */

export type Slot = 1 | 2 | 3 | 4;

export const SLOTS: { id: Slot; name: string }[] = [
  { id: 1, name: "早餐" },
  { id: 2, name: "午餐" },
  { id: 3, name: "晚餐" },
  { id: 4, name: "宵夜" },
];

export const slotName = (s: number) => SLOTS.find((x) => x.id === s)?.name ?? "晚餐";

export const isSlot = (s: unknown): s is Slot => s === 1 || s === 2 || s === 3 || s === 4;

/** 北京时间相对 UTC 的偏移（中国无夏令时）与切日点 */
const TZ_OFFSET_MS = 8 * 3600_000;
const DAY_START_MS = 4 * 3600_000;

/** 时间戳所属的「餐饮日」，'YYYY-MM-DD' */
export function mealDayOf(ts: number): string {
  return new Date(ts + TZ_OFFSET_MS - DAY_START_MS).toISOString().slice(0, 10);
}

export const isMealDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** 日期加减天数 */
export function addDays(date: string, n: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + n * 86400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** b - a 相差几天 */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);
}

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

/** 0 = 周日 … 6 = 周六 */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** '5/17 周六' */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d} 周${WEEK[weekdayOf(date)]}`;
}

/** 相对 today 的叫法；超出 昨天~后天 返回 null */
export function dayLabel(date: string, today: string): string | null {
  const n = diffDays(today, date);
  return ({ [-1]: "昨天", 0: "今天", 1: "明天", 2: "后天" } as Record<number, string>)[n] ?? null;
}

/** 订单标题：'今天 · 晚餐'、'5/12 周一 · 午餐' */
export function mealTitle(date: string, slot: number, today: string): string {
  return `${dayLabel(date, today) ?? shortDate(date)} · ${slotName(slot)}`;
}

/** 下单面板里可选的日期：昨天（补录）/ 今天 / 明天 / 后天 */
export function pickableDays(today: string): string[] {
  return [-1, 0, 1, 2].map((n) => addDays(today, n));
}

/**
 * 每餐「算过了」的北京时间钟点（相对当天 0 点，小时）。宵夜到次日凌晨 4 点。
 * 只用于挑默认值，不限制选择 —— 选过去的餐就是补录。
 */
const SLOT_END_HOUR: Record<Slot, number> = { 1: 10, 2: 14, 3: 21, 4: 28 };

/**
 * 下单面板的默认选中：从现在往后，第一个还没下过单的餐。
 * - 周一到周五只考虑晚餐，周六日考虑午餐、晚餐；早餐和宵夜从不作默认，只能手选。
 * - taken：已有订单的 'YYYY-MM-DD:slot' 集合。
 * - 都被占了就退回「今天 · 晚餐」。
 */
export function defaultPick(
  now: number,
  today: string,
  taken: Set<string>,
): { date: string; slot: Slot } {
  // 当前是「今天」的第几个小时（0~28，凌晨 0~4 点记作 24~28）
  const hour = ((now + TZ_OFFSET_MS - DAY_START_MS) % 86400_000) / 3600_000 + 4;
  for (let n = 0; n <= 2; n++) {
    const date = addDays(today, n);
    const wd = weekdayOf(date);
    const candidates: Slot[] = wd === 0 || wd === 6 ? [2, 3] : [3];
    for (const slot of candidates) {
      if (n === 0 && hour >= SLOT_END_HOUR[slot]) continue;
      if (taken.has(mealKey(date, slot))) continue;
      return { date, slot };
    }
  }
  return { date: today, slot: 3 };
}

export const mealKey = (date: string, slot: number) => `${date}:${slot}`;
