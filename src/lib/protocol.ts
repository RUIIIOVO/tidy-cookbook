/**
 * 点菜单 / 历史订单 实时同步协议。Worker（worker/kitchen-do.ts）和前端（src/lib/sync.ts）共用。
 * 改这里就是改协议，两端要一起改，并把 PROTOCOL_VERSION 加一。
 */
import type { Slot } from "./meal-time";

/**
 * 客户端连接 /api/sync 时带 ?v=；服务端发现低于此版本时，对 v>=2 的页面回 { type: "reload" }（自动刷新一次），
 * 更早的页面回 denied 提示手动刷新
 */
export const PROTOCOL_VERSION = 2;

/** 点菜单里的一行 */
export type CartItem = {
  dishId: string;
  qty: number;
  addedAt: number;
  /** 第一个点这道菜的人（user.id） */
  addedById?: string | null;
  /** 同上的显示名 */
  addedBy?: string | null;
};

/** 订单里的一行 */
export type MealItem = {
  dishId: string;
  qty: number;
  addedById?: string | null;
  addedBy?: string | null;
};

/** 一张订单（历史订单）。就餐日期 >= today 的叫「待吃」，在快照里实时同步 */
export type Meal = {
  id: string;
  mealDate: string; // 'YYYY-MM-DD'
  slot: Slot;
  /** 乐观锁版本号，saveMeal 必须带上打开编辑时的值 */
  rev: number;
  orderedAt: number;
  orderedBy: string | null; // 显示名
  updatedAt: number;
  items: MealItem[];
};

/** 买菜勾选：某张订单的某个食材已买 */
export type BoughtMark = { mealId: string; name: string };

export type Snapshot = {
  /** 服务端认定的餐饮日（凌晨 4 点切日），前端一律以此为「今天」 */
  today: string;
  /** 点菜单 */
  items: CartItem[];
  /** 待吃订单：mealDate >= today，按 mealDate、slot 升序 */
  meals: Meal[];
  /** 待吃订单的买菜勾选 */
  bought: BoughtMark[];
  /** 菜品累计点过的份数 */
  stats: Record<string, number>;
};

/** 点菜单操作：断网可排队，重放幂等（qty 为绝对值） */
export type CartOp =
  | { type: "set"; dishId: string; qty: number; ts: number }
  | { type: "removeMany"; dishIds: string[]; ts: number }
  | { type: "clear"; ts: number };

/**
 * 需要回执的操作：必须在线，带 reqId，服务端回 ack。
 * reqId 由客户端生成（crypto.randomUUID），服务端用它去重，重发不会重复下单。
 */
export type RequestOp =
  /** 下单：把 items 从点菜单移进 (date, slot) 的订单；该餐已有订单就合并（份数相加） */
  | { type: "placeOrder"; reqId: string; date: string; slot: Slot; items: { dishId: string; qty: number }[] }
  /**
   * 保存订单：整单覆盖。rev 不等于当前版本就拒绝（reason: "conflict"）。
   * 改到已有订单的另一餐时，两单合并到目标单，原单删除。items 为空等同删除。
   */
  | {
      type: "saveMeal";
      reqId: string;
      mealId: string;
      rev: number;
      date: string;
      slot: Slot;
      items: { dishId: string; qty: number }[];
    }
  | { type: "deleteMeal"; reqId: string; mealId: string }
  /** 勾选 / 取消勾选买菜清单里的一项（合并后的食材可能涉及多张订单） */
  | { type: "buy"; reqId: string; mealIds: string[]; name: string; done: boolean };

export type ClientMessage = CartOp | RequestOp | { type: "pull" };

export type ServerMessage =
  | ({ type: "snapshot" } & Snapshot)
  | {
      type: "ack";
      reqId: string;
      ok: boolean;
      /** ok=false 时：给人看的原因 */
      reason?: string;
      /** 冲突等可识别的失败 */
      code?: "conflict" | "forbidden" | "invalid" | "not_found";
      /** placeOrder / saveMeal 成功后订单的 id（合并时是目标单） */
      mealId?: string;
    }
  | { type: "denied"; reason: string }
  | { type: "reload" };
