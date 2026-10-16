/**
 * 一个厨房 = 一个 Durable Object 实例。
 *
 * 免费版有两个坑，这里都绕开了：
 *  1. 每条 WebSocket 消息都算一次 DO 请求（100k/天）。所以只在真正变更时广播，
 *     心跳交给 setWebSocketAutoResponse —— 平台层直接回 pong，不唤醒 DO、不计请求。
 *  2. duration 按 GB-s 计费。用 Hibernation API（acceptWebSocket 而非 accept），
 *     空闲时对象休眠，不产生 duration 费用。
 *
 * 数据分两层：
 *  - 点菜单（cart_item）：随时可改，set / removeMany / clear 走离线队列，重放幂等。
 *  - 订单（meal + meal_item）：一个「就餐日期 + 餐别」一张。placeOrder / saveMeal / deleteMeal / buy
 *    必须在线、带 reqId、回 ack；reqId 记进 op_seen，重发不会重复执行。
 *
 * 所有消息串行处理（enqueue）：D1 调用会让出执行权，不串行的话两条消息会交错读写。
 */

import { RAW } from "../src/data/raw";
import { isMealDate, isSlot, mealDayOf, mealTitle, pickableDays } from "../src/lib/meal-time";
import {
  PROTOCOL_VERSION,
  type BoughtMark,
  type CartItem,
  type Meal,
  type MealItem,
  type RequestOp,
  type ServerMessage,
  type Snapshot,
} from "../src/lib/protocol";

/** dishId → 菜名，只用来拼通知文案和校验 dishId */
const DISH_NAME = new Map<string, string>(RAW.map((r) => [String(r[0]), r[1]]));

/**
 * dishId → 这道菜用到的食材名。买菜清单按食材名合并，勾选以（订单, 食材名）为键。
 * 服务端自己算，菜被删时才能可靠地清掉对应勾选（不依赖客户端，多设备不会互相覆盖）。
 * 解析规则与 src/data/dishes.ts 的 parseIngredients 保持一致。
 */
const DISH_INGREDIENTS = new Map<string, string[]>(
  RAW.map((r) => {
    const names: string[] = [];
    for (const block of r[6].split("@")) {
      const rest = block.split("|")[1] ?? "";
      for (const x of rest.split(";").map((t) => t.trim())) {
        if (!x || x === "无") continue;
        const i = x.lastIndexOf(" ");
        names.push(i === -1 ? x : x.slice(0, i));
      }
    }
    return [String(r[0]), names];
  }),
);

/** 一组菜用到的食材名 */
function ingredientsOf(dishIds: Iterable<string>): Set<string> {
  const names = new Set<string>();
  for (const id of dishIds) for (const n of DISH_INGREDIENTS.get(id) ?? []) names.add(n);
  return names;
}

/** 旧的游客默认名统一显示成「食客」 */
export function normalizeName(n?: string | null): string | null {
  if (!n) return null;
  return n === "小客" || n.toLowerCase() === "guest" ? "食客" : n;
}

type Attachment = {
  userId: string;
  role: "owner" | "guest";
  name?: string;
  kitchen?: string;
  /** 客户端协议版本；缺失按 0（旧页面） */
  v?: number;
};

type Item = { dishId: string; qty: number };

/** 订单类操作的处理结果，原样变成 ack */
type Result = { ok: true; mealId?: string } | { ok: false; code?: "conflict" | "forbidden" | "invalid" | "not_found"; reason: string };

const OLD_VERSION = "页面已更新，请刷新";
const BUSY = "服务器出错了，请重试";

/** 校验并合并 items：dishId 必须存在，qty 必须是正整数；重复的菜份数相加。非法返回 null */
function normItems(raw: unknown): Item[] | null {
  if (!Array.isArray(raw)) return null;
  const m = new Map<string, number>();
  for (const it of raw) {
    if (!it || typeof it !== "object") return null;
    const { dishId, qty } = it as { dishId?: unknown; qty?: unknown };
    if (typeof dishId !== "string" || !DISH_NAME.has(dishId)) return null;
    if (typeof qty !== "number" || !Number.isSafeInteger(qty) || qty <= 0) return null;
    m.set(dishId, (m.get(dishId) ?? 0) + qty);
  }
  return [...m].map(([dishId, qty]) => ({ dishId, qty }));
}

type MealRow = {
  id: string;
  mealDate: string;
  slot: number;
  rev: number;
  orderedBy: string;
  orderedAt: number;
};
type StoredItem = { dishId: string; qty: number; addedById: string | null };

export class KitchenDO implements DurableObject {
  private kitchenId = "main";
  private snap: Snapshot | null = null;
  /** 消息串行队列 */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private state: DurableObjectState,
    private env: { DB: D1Database; BARK_URL?: string },
  ) {
    // 平台层自动应答心跳：客户端发 "ping" 直接回 "pong"，DO 不被唤醒也不计费
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** 排队执行：前一条处理完才轮到下一条，出错不会堵住后面的 */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  /**
   * 取当前快照。首次用到时从 D1 装载；之后每次都先看「今天」有没有变（跨过凌晨 4 点），
   * 变了就重新装载 —— 昨天的订单要离开 meals / bought。
   */
  private async load(): Promise<Snapshot> {
    const today = mealDayOf(Date.now());
    if (this.snap && this.snap.today === today) return this.snap;
    return this.reload(today);
  }

  /** 从 D1 整体重读（一次 batch，一个往返） */
  private async reload(today = mealDayOf(Date.now())): Promise<Snapshot> {
    const K = this.kitchenId;
    const db = this.env.DB;
    const [items, meals, mealItems, bought, stats] = await db.batch([
      db
        .prepare(
          `SELECT c.dish_id AS dishId, c.qty, c.added_at AS addedAt,
                  c.added_by AS addedById, u.display_name AS addedBy
             FROM cart_item c LEFT JOIN user u ON u.id = c.added_by
            WHERE c.kitchen_id = ? ORDER BY c.added_at`,
        )
        .bind(K),
      db
        .prepare(
          `SELECT m.id, m.meal_date AS mealDate, m.slot, m.rev, m.ordered_at AS orderedAt,
                  m.updated_at AS updatedAt, u.display_name AS orderedBy
             FROM meal m LEFT JOIN user u ON u.id = m.ordered_by
            WHERE m.kitchen_id = ? AND m.meal_date >= ?
            ORDER BY m.meal_date, m.slot, m.ordered_at, m.id`,
        )
        .bind(K, today),
      db
        .prepare(
          `SELECT i.meal_id AS mealId, i.dish_id AS dishId, i.qty,
                  i.added_by AS addedById, u.display_name AS addedBy
             FROM meal_item i
             JOIN meal m ON m.id = i.meal_id
             LEFT JOIN user u ON u.id = i.added_by
            WHERE m.kitchen_id = ? AND m.meal_date >= ?
            ORDER BY i.rowid`,
        )
        .bind(K, today),
      db
        .prepare(
          `SELECT s.meal_id AS mealId, s.name
             FROM shopping_done s JOIN meal m ON m.id = s.meal_id
            WHERE m.kitchen_id = ? AND m.meal_date >= ?
            ORDER BY s.updated_at`,
        )
        .bind(K, today),
      db.prepare(`SELECT dish_id AS dishId, order_count AS count FROM dish_stat WHERE kitchen_id = ?`).bind(K),
    ]);

    const byMeal = new Map<string, MealItem[]>();
    for (const r of (mealItems.results ?? []) as (MealItem & { mealId: string })[]) {
      const arr = byMeal.get(r.mealId) ?? [];
      arr.push({ dishId: r.dishId, qty: r.qty, addedById: r.addedById, addedBy: normalizeName(r.addedBy) });
      byMeal.set(r.mealId, arr);
    }
    const mealList = ((meals.results ?? []) as (Omit<Meal, "items"> & { updatedAt: number | null })[]).map(
      (m): Meal => ({
        id: m.id,
        mealDate: m.mealDate,
        slot: m.slot,
        rev: m.rev,
        orderedAt: m.orderedAt,
        orderedBy: normalizeName(m.orderedBy),
        updatedAt: m.updatedAt ?? m.orderedAt,
        items: byMeal.get(m.id) ?? [],
      }),
    );
    const statMap: Record<string, number> = {};
    for (const r of (stats.results ?? []) as { dishId: string; count: number }[]) statMap[r.dishId] = r.count;

    this.snap = {
      today,
      items: (items.results ?? []) as CartItem[],
      meals: mealList,
      bought: (bought.results ?? []) as BoughtMark[],
      stats: statMap,
    };
    return this.snap;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    this.kitchenId = url.searchParams.get("kitchen") ?? "main";

    // 定时任务入口（只有 Worker 内部能调到，外部请求进不来这里）
    if (url.pathname === "/rollover") {
      return this.enqueue(async () => {
        const now = Date.now();
        // 只清过期的幂等记录；点菜单不碰。今天变了，重读订单并广播
        const r = await this.env.DB.prepare(`DELETE FROM op_seen WHERE kitchen_id = ? AND at < ?`)
          .bind(this.kitchenId, now - 3 * 86400_000)
          .run();
        await this.reload(mealDayOf(now));
        this.broadcast();
        return Response.json({ ok: true, today: this.snap?.today, purged: r.meta?.changes ?? 0 });
      });
    }

    if (req.headers.get("Upgrade") !== "websocket")
      return new Response("expected websocket", { status: 426 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const attachment: Attachment = {
      userId: url.searchParams.get("uid") ?? "?",
      role: (url.searchParams.get("role") as Attachment["role"]) ?? "guest",
      name: url.searchParams.get("name") ?? undefined,
      kitchen: this.kitchenId,
      v: Number(url.searchParams.get("v")) || 0,
    };
    // 附着在 socket 上，休眠唤醒后仍可读回，不用重查数据库
    server.serializeAttachment(attachment);
    this.state.acceptWebSocket(server);

    // 旧页面也先给一份快照（点菜单部分它还能用），具体的旧操作在 webSocketMessage 里拒绝
    const snap = await this.enqueue(() => this.load());
    server.send(JSON.stringify({ type: "snapshot", ...snap }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;
    let op: Record<string, unknown>;
    try {
      op = JSON.parse(raw);
    } catch {
      return;
    }
    if (!op || typeof op !== "object" || typeof op.type !== "string") return;

    try {
      await this.enqueue(() => this.handle(ws, op));
    } catch (e) {
      console.error("handle failed", op.type, e);
    }
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* 连接已断，忽略 */
    }
  }

  private async handle(ws: WebSocket, op: Record<string, unknown>) {
    const who = (ws.deserializeAttachment() ?? {}) as Attachment;
    // 休眠唤醒后 fetch 没跑过，kitchenId 从 socket 上读回
    if (who.kitchen) this.kitchenId = who.kitchen;
    const snap = await this.load();
    const type = op.type as string;

    if (type === "pull") {
      this.send(ws, { type: "snapshot", ...snap });
      return;
    }

    const isRequest = type === "placeOrder" || type === "saveMeal" || type === "deleteMeal" || type === "buy";
    const isCart = type === "set" || type === "removeMany" || type === "clear";
    const oldClient = (who.v ?? 0) < PROTOCOL_VERSION;

    // 旧页面的 lock / unlock / 不带 reqId 的 buy 等，一律让它刷新；新页面发了不认识的操作直接忽略
    if (!isRequest && !isCart) {
      if (oldClient || type === "lock" || type === "unlock")
        this.send(ws, { type: "denied", reason: OLD_VERSION });
      return;
    }
    if (isRequest && (oldClient || typeof op.reqId !== "string" || !op.reqId)) {
      this.send(ws, { type: "denied", reason: OLD_VERSION });
      return;
    }

    if (isCart) {
      // guest 不能清空点菜单，也不能批量删
      if ((type === "clear" || type === "removeMany") && who.role !== "owner") {
        this.send(ws, { type: "denied", reason: "只有 rui 和 hui 能清空点菜单" });
        return;
      }
      if (await this.applyCart(op, who, snap)) this.broadcast();
      return;
    }

    await this.handleRequest(ws, op as unknown as RequestOp, who, snap);
  }

  /** 点菜单操作。返回是否有变化（要不要广播） */
  private async applyCart(op: Record<string, unknown>, who: Attachment, snap: Snapshot): Promise<boolean> {
    const userId = who.userId;
    const now = Date.now();
    const K = this.kitchenId;

    switch (op.type) {
      case "set": {
        const dishId = op.dishId;
        const qty = Math.floor(Number(op.qty));
        if (typeof dishId !== "string" || !Number.isFinite(qty)) return false;
        if (qty <= 0) {
          snap.items = snap.items.filter((i) => i.dishId !== dishId);
          await this.env.DB.prepare(`DELETE FROM cart_item WHERE kitchen_id = ? AND dish_id = ?`)
            .bind(K, dishId)
            .run();
        } else {
          if (!DISH_NAME.has(dishId)) return false;
          const found = snap.items.find((i) => i.dishId === dishId);
          const addedAt = found?.addedAt ?? now;
          await this.env.DB.prepare(
            `INSERT INTO cart_item (kitchen_id, dish_id, qty, added_by, added_at, updated_at)
             VALUES (?,?,?,?,?,?)
             ON CONFLICT(kitchen_id, dish_id) DO UPDATE SET qty = excluded.qty, updated_at = excluded.updated_at`,
          )
            .bind(K, dishId, qty, userId, addedAt, now)
            .run();
          if (found) found.qty = qty;
          else
            snap.items.push({
              dishId,
              qty,
              addedAt,
              addedById: userId,
              addedBy: who.name ?? (await this.nameOf(userId)),
            });
        }
        return true;
      }
      case "removeMany": {
        const ids = Array.isArray(op.dishIds) ? op.dishIds.filter((x): x is string => typeof x === "string") : [];
        if (!ids.length) return false;
        await this.env.DB.batch(
          ids.map((id) =>
            this.env.DB.prepare(`DELETE FROM cart_item WHERE kitchen_id = ? AND dish_id = ?`).bind(K, id),
          ),
        );
        const kill = new Set(ids);
        snap.items = snap.items.filter((i) => !kill.has(i.dishId));
        return true;
      }
      case "clear": {
        // 只清点菜单；不归档，也不碰订单和买菜勾选
        await this.env.DB.prepare(`DELETE FROM cart_item WHERE kitchen_id = ?`).bind(K).run();
        snap.items = [];
        return true;
      }
    }
    return false;
  }

  // ───────────────────────── 订单类操作 ─────────────────────────

  /** 去重 → 执行 → 刷新快照并广播 → 回 ack */
  private async handleRequest(ws: WebSocket, op: RequestOp, who: Attachment, snap: Snapshot) {
    const reqId = op.reqId;
    const ack = (r: Result) => this.send(ws, { type: "ack", reqId, ...r });

    let r: Result;
    try {
      const seen = await this.env.DB.prepare(`SELECT meal_id AS mealId FROM op_seen WHERE op_id = ?`)
        .bind(reqId)
        .first<{ mealId: string | null }>();
      if (seen) {
        ack({ ok: true, ...(seen.mealId ? { mealId: seen.mealId } : {}) });
        return;
      }
      switch (op.type) {
        case "placeOrder":
          r = await this.placeOrder(op, who, snap);
          break;
        case "saveMeal":
          r = await this.saveMeal(op, who, snap);
          break;
        case "deleteMeal":
          r = await this.deleteMeal(op, who, snap);
          break;
        default:
          r = await this.buy(op, snap);
      }
    } catch (e) {
      console.error("request failed", op.type, e);
      ack({ ok: false, reason: BUSY });
      return;
    }

    if (r.ok) {
      try {
        await this.reload(snap.today);
        this.broadcast();
      } catch (e) {
        // 写入已成功，只是快照没刷出去：丢掉内存，下次消息会重读
        console.error("reload failed", e);
        this.snap = null;
      }
    }
    ack(r);
  }

  private opSeen(reqId: string, mealId: string | null, now: number) {
    return this.env.DB.prepare(`INSERT INTO op_seen (op_id, kitchen_id, meal_id, at) VALUES (?,?,?,?)`).bind(
      reqId,
      this.kitchenId,
      mealId,
      now,
    );
  }

  /** dish_stat 增减（delta 可负，不低于 0） */
  private statStmt(dishId: string, delta: number) {
    return this.env.DB.prepare(
      `INSERT INTO dish_stat (kitchen_id, dish_id, order_count) VALUES (?,?,MAX(0,?))
       ON CONFLICT(kitchen_id, dish_id) DO UPDATE SET order_count = MAX(0, order_count + ?)`,
    ).bind(this.kitchenId, dishId, delta, delta);
  }

  private async readMeal(id: string): Promise<{ row: MealRow; items: StoredItem[] } | null> {
    const K = this.kitchenId;
    const row = await this.env.DB.prepare(
      `SELECT id, meal_date AS mealDate, slot, rev, ordered_by AS orderedBy, ordered_at AS orderedAt
         FROM meal WHERE id = ? AND kitchen_id = ?`,
    )
      .bind(id, K)
      .first<MealRow>();
    if (!row) return null;
    const items = await this.env.DB.prepare(
      `SELECT dish_id AS dishId, qty, added_by AS addedById FROM meal_item WHERE meal_id = ? ORDER BY rowid`,
    )
      .bind(id)
      .all<StoredItem>();
    return { row, items: items.results ?? [] };
  }

  /** (date, slot) 已有的订单（排除 excludeId）。旧数据同一餐可能有多条，取最早的 */
  private async findSlot(date: string, slot: number, excludeId = ""): Promise<string | null> {
    const r = await this.env.DB.prepare(
      `SELECT id FROM meal WHERE kitchen_id = ? AND meal_date = ? AND slot = ? AND id != ?
        ORDER BY ordered_at, id LIMIT 1`,
    )
      .bind(this.kitchenId, date, slot, excludeId)
      .first<{ id: string }>();
    return r?.id ?? null;
  }

  private async placeOrder(
    op: Extract<RequestOp, { type: "placeOrder" }>,
    who: Attachment,
    snap: Snapshot,
  ): Promise<Result> {
    const items = normItems(op.items);
    if (!items || !items.length) return { ok: false, code: "invalid", reason: "没有可下单的菜" };
    if (!isSlot(op.slot)) return { ok: false, code: "invalid", reason: "餐别不对" };
    if (!isMealDate(op.date) || !pickableDays(snap.today).includes(op.date))
      return { ok: false, code: "invalid", reason: "这个日期不能下单，请刷新" };

    const K = this.kitchenId;
    const db = this.env.DB;
    const now = Date.now();
    const userId = who.userId;
    const targetId = await this.findSlot(op.date, op.slot);
    const mealId = targetId ?? crypto.randomUUID();

    const stmts: D1PreparedStatement[] = [];
    if (targetId) {
      // 合并：份数相加，已有的菜保留原来的 added_by
      stmts.push(db.prepare(`UPDATE meal SET rev = rev + 1, updated_at = ? WHERE id = ?`).bind(now, mealId));
    } else {
      stmts.push(
        db
          .prepare(
            `INSERT INTO meal (id, kitchen_id, ordered_by, ordered_at, meal_date, slot, rev, updated_at)
             VALUES (?,?,?,?,?,?,1,?)`,
          )
          .bind(mealId, K, userId, now, op.date, op.slot, now),
      );
    }
    for (const it of items) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO meal_item (meal_id, dish_id, qty, added_by) VALUES (?,?,?,?)
             ON CONFLICT(meal_id, dish_id) DO UPDATE SET qty = qty + excluded.qty`,
          )
          .bind(mealId, it.dishId, it.qty, userId),
        // 从点菜单扣掉这些份数，不够扣的删掉；别人刚加的份数不会被带走
        db
          .prepare(`UPDATE cart_item SET qty = qty - ?, updated_at = ? WHERE kitchen_id = ? AND dish_id = ?`)
          .bind(it.qty, now, K, it.dishId),
        db
          .prepare(`DELETE FROM cart_item WHERE kitchen_id = ? AND dish_id = ? AND qty <= 0`)
          .bind(K, it.dishId),
        this.statStmt(it.dishId, it.qty),
      );
    }
    stmts.push(this.opSeen(op.reqId, mealId, now));
    await db.batch(stmts);

    this.notify(who, "下单了", op.date, op.slot, snap.today, items);
    return { ok: true, mealId };
  }

  private async saveMeal(
    op: Extract<RequestOp, { type: "saveMeal" }>,
    who: Attachment,
    snap: Snapshot,
  ): Promise<Result> {
    if (typeof op.mealId !== "string") return { ok: false, code: "invalid", reason: "参数不对" };
    const orig = await this.readMeal(op.mealId);
    if (!orig) return { ok: false, code: "not_found", reason: "这单已经不在了" };
    const today = snap.today;
    const owner = who.role === "owner";
    const origPast = orig.row.mealDate < today;
    if (origPast && !owner) return { ok: false, code: "forbidden", reason: "以前的订单只有 rui 和 hui 能改" };
    if (orig.row.rev !== op.rev) return { ok: false, code: "conflict", reason: "刚被改过，已刷新" };

    const items = normItems(op.items);
    if (!items) return { ok: false, code: "invalid", reason: "菜品数据不对" };
    // 空单 = 删除
    if (!items.length) return this.removeMeal(op.reqId, orig, who, today);

    if (!isSlot(op.slot)) return { ok: false, code: "invalid", reason: "餐别不对" };
    if (!isMealDate(op.date) || !(pickableDays(today).includes(op.date) || op.date === orig.row.mealDate))
      return { ok: false, code: "invalid", reason: "这个日期不能选，请刷新" };
    if (op.date < today && !owner)
      return { ok: false, code: "forbidden", reason: "已过去的日子只有 rui 和 hui 能改" };

    const db = this.env.DB;
    const now = Date.now();
    const userId = who.userId;
    const origAdder = new Map(orig.items.map((i) => [i.dishId, i.addedById]));
    const oldQty = new Map(orig.items.map((i) => [i.dishId, i.qty]));
    const newQty = new Map(items.map((i) => [i.dishId, i.qty]));
    const addedBy = (dishId: string) => origAdder.get(dishId) ?? userId;

    // 只有改了日期或餐别才会合并：旧数据同一天可能有多条晚餐，原地保存不能把它们并掉
    const moved = op.date !== orig.row.mealDate || op.slot !== orig.row.slot;
    const targetId = moved ? await this.findSlot(op.date, op.slot, orig.row.id) : null;
    const stmts: D1PreparedStatement[] = [];
    let finalId = orig.row.id;

    // 该订单上现有的勾选，用来清掉「不再需要的食材」
    const marks = async (mealId: string) =>
      ((await db
        .prepare(`SELECT name FROM shopping_done WHERE meal_id = ?`)
        .bind(mealId)
        .all<{ name: string }>()).results ?? []).map((r) => r.name);

    if (targetId) {
      // 合并进目标单，原单删除，勾选改挂到目标单
      finalId = targetId;
      const target = await this.readMeal(targetId);
      const finalDishes = new Set([...(target?.items ?? []).map((i) => i.dishId), ...newQty.keys()]);
      const valid = ingredientsOf(finalDishes);
      for (const it of items) {
        stmts.push(
          db
            .prepare(
              `INSERT INTO meal_item (meal_id, dish_id, qty, added_by) VALUES (?,?,?,?)
               ON CONFLICT(meal_id, dish_id) DO UPDATE SET qty = qty + excluded.qty`,
            )
            .bind(targetId, it.dishId, it.qty, addedBy(it.dishId)),
        );
      }
      stmts.push(
        db.prepare(`UPDATE meal SET rev = rev + 1, updated_at = ? WHERE id = ?`).bind(now, targetId),
        db
          .prepare(
            `INSERT OR IGNORE INTO shopping_done (kitchen_id, meal_id, name, updated_at)
             SELECT kitchen_id, ?, name, updated_at FROM shopping_done WHERE meal_id = ?`,
          )
          .bind(targetId, orig.row.id),
        db.prepare(`DELETE FROM shopping_done WHERE meal_id = ?`).bind(orig.row.id),
        db.prepare(`DELETE FROM meal_item WHERE meal_id = ?`).bind(orig.row.id),
        db.prepare(`DELETE FROM meal WHERE id = ?`).bind(orig.row.id),
      );
      const names = new Set([...(await marks(orig.row.id)), ...(await marks(targetId))]);
      for (const n of names)
        if (!valid.has(n))
          stmts.push(db.prepare(`DELETE FROM shopping_done WHERE meal_id = ? AND name = ?`).bind(targetId, n));
    } else {
      // 整单覆盖：已存在的菜保留 added_by，新菜记当前用户
      const valid = ingredientsOf(newQty.keys());
      stmts.push(db.prepare(`DELETE FROM meal_item WHERE meal_id = ?`).bind(orig.row.id));
      for (const it of items)
        stmts.push(
          db
            .prepare(`INSERT INTO meal_item (meal_id, dish_id, qty, added_by) VALUES (?,?,?,?)`)
            .bind(orig.row.id, it.dishId, it.qty, addedBy(it.dishId)),
        );
      stmts.push(
        db
          .prepare(`UPDATE meal SET meal_date = ?, slot = ?, rev = rev + 1, updated_at = ? WHERE id = ?`)
          .bind(op.date, op.slot, now, orig.row.id),
      );
      for (const n of await marks(orig.row.id))
        if (!valid.has(n))
          stmts.push(db.prepare(`DELETE FROM shopping_done WHERE meal_id = ? AND name = ?`).bind(orig.row.id, n));
    }

    // 点过 X 次：按新旧份数差值调整（合并进目标单时目标单原有的份数早已计过，所以同样只看差值）
    for (const id of new Set([...oldQty.keys(), ...newQty.keys()])) {
      const delta = (newQty.get(id) ?? 0) - (oldQty.get(id) ?? 0);
      if (delta !== 0) stmts.push(this.statStmt(id, delta));
    }
    stmts.push(this.opSeen(op.reqId, finalId, now));
    await db.batch(stmts);

    // 涉及待吃订单才推送（改已吃订单不推）
    if (!origPast || op.date >= today)
      this.notify(who, "改了", op.date, op.slot, today, items);
    return { ok: true, mealId: finalId };
  }

  private async deleteMeal(
    op: Extract<RequestOp, { type: "deleteMeal" }>,
    who: Attachment,
    snap: Snapshot,
  ): Promise<Result> {
    if (typeof op.mealId !== "string") return { ok: false, code: "invalid", reason: "参数不对" };
    const orig = await this.readMeal(op.mealId);
    if (!orig) return { ok: false, code: "not_found", reason: "这单已经不在了" };
    if (orig.row.mealDate < snap.today && who.role !== "owner")
      return { ok: false, code: "forbidden", reason: "以前的订单只有 rui 和 hui 能删" };
    return this.removeMeal(op.reqId, orig, who, snap.today);
  }

  /** 删单：订单、明细、勾选一起删，dish_stat 减回。调用方负责权限 */
  private async removeMeal(
    reqId: string,
    orig: { row: MealRow; items: StoredItem[] },
    who: Attachment,
    today: string,
  ): Promise<Result> {
    const db = this.env.DB;
    const id = orig.row.id;
    const stmts: D1PreparedStatement[] = [
      db.prepare(`DELETE FROM meal_item WHERE meal_id = ?`).bind(id),
      db.prepare(`DELETE FROM shopping_done WHERE meal_id = ?`).bind(id),
      db.prepare(`DELETE FROM meal WHERE id = ? AND kitchen_id = ?`).bind(id, this.kitchenId),
      ...orig.items.map((i) => this.statStmt(i.dishId, -i.qty)),
      this.opSeen(reqId, null, Date.now()),
    ];
    await db.batch(stmts);
    if (orig.row.mealDate >= today)
      this.notify(who, "删了", orig.row.mealDate, orig.row.slot, today, orig.items, true);
    return { ok: true };
  }

  private async buy(op: Extract<RequestOp, { type: "buy" }>, snap: Snapshot): Promise<Result> {
    const ids = Array.isArray(op.mealIds) ? [...new Set(op.mealIds.filter((x): x is string => typeof x === "string"))] : [];
    if (!ids.length || ids.length > 80 || typeof op.name !== "string" || !op.name || typeof op.done !== "boolean")
      return { ok: false, code: "invalid", reason: "参数不对" };

    const db = this.env.DB;
    const marks = ids.map(() => "?").join(",");
    // 必须全是待吃订单
    const pending = await db
      .prepare(`SELECT id FROM meal WHERE kitchen_id = ? AND meal_date >= ? AND id IN (${marks})`)
      .bind(this.kitchenId, snap.today, ...ids)
      .all<{ id: string }>();
    if ((pending.results ?? []).length !== ids.length)
      return { ok: false, code: "not_found", reason: "订单已经变了，已刷新" };

    // 只记真正用到这个食材的订单
    const rows = await db
      .prepare(`SELECT meal_id AS mealId, dish_id AS dishId FROM meal_item WHERE meal_id IN (${marks})`)
      .bind(...ids)
      .all<{ mealId: string; dishId: string }>();
    const using = new Set<string>();
    for (const r of rows.results ?? []) if (DISH_INGREDIENTS.get(r.dishId)?.includes(op.name)) using.add(r.mealId);
    if (!using.size) return { ok: false, code: "invalid", reason: "清单里没有这个食材，已刷新" };

    const now = Date.now();
    const stmts: D1PreparedStatement[] = op.done
      ? [...using].map((m) =>
          db
            .prepare(`INSERT OR IGNORE INTO shopping_done (kitchen_id, meal_id, name, updated_at) VALUES (?,?,?,?)`)
            .bind(this.kitchenId, m, op.name, now),
        )
      : ids.map((m) => db.prepare(`DELETE FROM shopping_done WHERE meal_id = ? AND name = ?`).bind(m, op.name));
    stmts.push(this.opSeen(op.reqId, null, now));
    await db.batch(stmts);
    return { ok: true };
  }

  /** 下单 / 改单 / 删单后给主人手机推 Bark；失败只吞掉，不影响写入 */
  private notify(who: Attachment, verb: string, date: string, slot: number, today: string, items: Item[], noDishes = false) {
    const url = this.env.BARK_URL;
    if (!url) return;
    const title = mealTitle(date, slot, today);
    const dishes = items
      .map((i) => `${DISH_NAME.get(i.dishId) ?? i.dishId}${i.qty > 1 ? `×${i.qty}` : ""}`)
      .join("、");
    const total = items.reduce((n, i) => n + i.qty, 0);
    const name = who.name ?? "有人";
    const body = noDishes
      ? `🍽️ ${name}${verb}【${title}】`
      : `🍽️ ${name}${verb}【${title}】（共 ${total} 道）：${dishes}`;
    this.state.waitUntil(
      (async () => {
        try {
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              title: `今天吃什么 · ${title}`,
              body,
              group: "tidy-cookbook",
              level: "timeSensitive",
              isArchive: "1",
            }),
          });
        } catch {
          /* ignore */
        }
      })(),
    );
  }

  /** 休眠前建立的旧连接没带 name，回表查一次 */
  private async nameOf(userId: string): Promise<string | null> {
    const r = await this.env.DB.prepare(`SELECT display_name AS n FROM user WHERE id = ?`)
      .bind(userId)
      .first<{ n: string }>();
    return normalizeName(r?.n) ?? "食客";
  }

  private broadcast() {
    if (!this.snap) return;
    const msg = JSON.stringify({ type: "snapshot", ...this.snap });
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        /* 连接已断，忽略 */
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, "bye");
    } catch {
      /* 已关闭 */
    }
  }

  async webSocketError() {
    /* 交给平台回收 */
  }
}
