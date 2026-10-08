/**
 * 一个厨房 = 一个 Durable Object 实例。
 *
 * 免费版有两个坑，这里都绕开了：
 *  1. 每条 WebSocket 消息都算一次 DO 请求（100k/天）。所以只在真正变更时广播，
 *     心跳交给 setWebSocketAutoResponse —— 平台层直接回 pong，不唤醒 DO、不计请求。
 *  2. duration 按 GB-s 计费。用 Hibernation API（acceptWebSocket 而非 accept），
 *     空闲时对象休眠，不产生 duration 费用。
 */

import { RAW } from "../src/data/raw";

/** dishId → 菜名，只用来拼通知文案 */
const DISH_NAME = new Map<string, string>(RAW.map((r) => [String(r[0]), r[1]]));

export type CartItem = {
  dishId: string;
  qty: number;
  addedAt: number;
  /** 第一个点这道菜的人（user.id），归档到 meal_item 用 */
  addedById: string | null;
  /** 同上的显示名，给前端展示 */
  addedBy: string | null;
};
export type Snapshot = { items: CartItem[]; locked: boolean; rev: number };

type ClientOp =
  | { type: "set"; dishId: string; qty: number; ts: number }
  | { type: "removeMany"; dishIds: string[]; ts: number }
  | { type: "clear"; ts: number }
  | { type: "lock"; ts: number }
  | { type: "unlock"; ts: number }
  | { type: "pull" };

type Attachment = { userId: string; role: "owner" | "guest"; name?: string };

export class KitchenDO implements DurableObject {
  private kitchenId = "main";
  private snap: Snapshot | null = null;
  private rev = 0;
  /** 下单人（user.id）与下单时间；旧版本遗留的锁单没有 lockedBy，已归档过 */
  private lockedBy: string | null = null;
  private lockedAt = 0;

  constructor(
    private state: DurableObjectState,
    private env: { DB: D1Database; BARK_URL?: string },
  ) {
    // 平台层自动应答心跳：客户端发 "ping" 直接回 "pong"，DO 不被唤醒也不计费
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  /** 首次用到时从 D1 装载，之后常驻内存直到休眠 */
  private async load(): Promise<Snapshot> {
    if (this.snap) return this.snap;
    const [items, st] = await Promise.all([
      this.env.DB.prepare(
        `SELECT c.dish_id AS dishId, c.qty, c.added_at AS addedAt,
                c.added_by AS addedById, u.display_name AS addedBy
           FROM cart_item c LEFT JOIN user u ON u.id = c.added_by
          WHERE c.kitchen_id = ? ORDER BY c.added_at`,
      )
        .bind(this.kitchenId)
        .all<CartItem>(),
      this.env.DB.prepare(`SELECT locked, updated_at, locked_by FROM cart_state WHERE kitchen_id = ?`)
        .bind(this.kitchenId)
        .first<{ locked: number; updated_at: number; locked_by: string | null }>(),
    ]);
    this.snap = {
      items: items.results ?? [],
      locked: !!st?.locked,
      rev: ++this.rev,
    };
    this.lockedAt = st?.updated_at ?? 0;
    this.lockedBy = st?.locked_by ?? null;
    return this.snap;
  }

  /**
   * 归档并清空：把已下单的点菜单写进历史，再清空。每日定时任务和手动「开始下一餐」共用。
   * 归档和清空放进同一个 batch，要么都成功，要么都不动，订单不会丢也不会重复。
   * 没下过单的点菜单不动；旧版本遗留的锁单（lockedBy 为空）已归档过，只清空。
   */
  private async archiveAndClear(): Promise<boolean> {
    const snap = await this.load();
    if (!snap.locked) return false;
    const K = this.kitchenId;
    const now = Date.now();
    const stmts = [];
    if (snap.items.length && this.lockedBy) {
      const mealId = crypto.randomUUID();
      stmts.push(
        this.env.DB.prepare(
          `INSERT INTO meal (id, kitchen_id, ordered_by, ordered_at) VALUES (?,?,?,?)`,
        ).bind(mealId, K, this.lockedBy, this.lockedAt),
        ...snap.items.map((i) =>
          this.env.DB.prepare(
            `INSERT INTO meal_item (meal_id, dish_id, qty, added_by) VALUES (?,?,?,?)`,
          ).bind(mealId, i.dishId, i.qty, i.addedById),
        ),
      );
    }
    stmts.push(
      this.env.DB.prepare(`DELETE FROM cart_item WHERE kitchen_id = ?`).bind(K),
      this.env.DB.prepare(
        `UPDATE cart_state SET locked = 0, locked_by = NULL, updated_at = ? WHERE kitchen_id = ?`,
      ).bind(now, K),
    );
    await this.env.DB.batch(stmts);
    snap.items = [];
    snap.locked = false;
    snap.rev = ++this.rev;
    this.lockedBy = null;
    this.lockedAt = now;
    this.broadcast();
    return true;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    this.kitchenId = url.searchParams.get("kitchen") ?? "main";

    // 定时任务入口（只有 Worker 内部能调到，外部请求进不来这里）
    if (url.pathname === "/rollover") {
      const archived = await this.archiveAndClear();
      return Response.json({ ok: true, archived });
    }

    if (req.headers.get("Upgrade") !== "websocket")
      return new Response("expected websocket", { status: 426 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const attachment: Attachment = {
      userId: url.searchParams.get("uid") ?? "?",
      role: (url.searchParams.get("role") as Attachment["role"]) ?? "guest",
      name: url.searchParams.get("name") ?? undefined,
    };
    // 附着在 socket 上，休眠唤醒后仍可读回，不用重查数据库
    server.serializeAttachment(attachment);
    this.state.acceptWebSocket(server);

    const snap = await this.load();
    server.send(JSON.stringify({ type: "snapshot", ...snap }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;
    let op: ClientOp;
    try {
      op = JSON.parse(raw);
    } catch {
      return;
    }

    const who = (ws.deserializeAttachment() ?? {}) as Attachment;
    const snap = await this.load();

    if (op.type === "pull") {
      ws.send(JSON.stringify({ type: "snapshot", ...snap }));
      return;
    }

    // guest 不能清空点菜单，也不能批量删
    const destructive = op.type === "clear" || op.type === "removeMany";
    if (destructive && who.role !== "owner") {
      ws.send(
        JSON.stringify({ type: "denied", reason: "只有 rui 和 hui 能清空点菜单" }),
      );
      return;
    }
    // 锁单后只冻结「菜品组成」。unlock（重新编辑）和 clear（开始下一餐）必须放行，
    // 否则点菜单页那两个按钮点下去会永远卡住。
    const mutatesItems = op.type === "set" || op.type === "removeMany";
    if (snap.locked && mutatesItems) {
      ws.send(
        JSON.stringify({
          type: "denied",
          reason: "这一餐已经定了，想改先点「重新编辑」",
        }),
      );
      return;
    }
    // 已锁的状态再 lock 会归档出重复的历史记录
    if (snap.locked && op.type === "lock") return;

    await this.apply(op, who, snap);
    this.broadcast();
  }

  /** 下单后给主人手机推 Bark；失败只吞掉，不影响锁单 */
  private async notifyOrder(name: string | null, items: CartItem[]) {
    const url = this.env.BARK_URL;
    if (!url) return;
    const dishes = items
      .map((i) => `${DISH_NAME.get(i.dishId) ?? i.dishId}${i.qty > 1 ? `×${i.qty}` : ""}`)
      .join("、");
    const total = items.reduce((n, i) => n + i.qty, 0);
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          title: "今天吃什么",
          body: `🍽️ ${name ?? "有人"}下单了（共 ${total} 道）：${dishes}`,
          group: "tidy-cookbook",
          level: "timeSensitive",
          isArchive: "1",
        }),
      });
    } catch {
      /* ignore */
    }
  }

  private async apply(op: ClientOp, who: Attachment, snap: Snapshot) {
    const userId = who.userId;
    const now = Date.now();
    const K = this.kitchenId;

    switch (op.type) {
      case "set": {
        if (op.qty <= 0) {
          snap.items = snap.items.filter((i) => i.dishId !== op.dishId);
          await this.env.DB.prepare(
            `DELETE FROM cart_item WHERE kitchen_id = ? AND dish_id = ?`,
          )
            .bind(K, op.dishId)
            .run();
        } else {
          const found = snap.items.find((i) => i.dishId === op.dishId);
          if (found) found.qty = op.qty;
          else
            snap.items.push({
              dishId: op.dishId,
              qty: op.qty,
              addedAt: now,
              addedById: userId,
              addedBy: who.name ?? (await this.nameOf(userId)),
            });
          await this.env.DB.prepare(
            `INSERT INTO cart_item (kitchen_id, dish_id, qty, added_by, added_at, updated_at)
             VALUES (?,?,?,?,?,?)
             ON CONFLICT(kitchen_id, dish_id) DO UPDATE SET qty = excluded.qty, updated_at = excluded.updated_at`,
          )
            .bind(K, op.dishId, op.qty, userId, found?.addedAt ?? now, now)
            .run();
        }
        break;
      }
      case "removeMany": {
        const kill = new Set(op.dishIds);
        snap.items = snap.items.filter((i) => !kill.has(i.dishId));
        const marks = op.dishIds.map(() => "?").join(",");
        if (op.dishIds.length)
          await this.env.DB.prepare(
            `DELETE FROM cart_item WHERE kitchen_id = ? AND dish_id IN (${marks})`,
          )
            .bind(K, ...op.dishIds)
            .run();
        break;
      }
      case "clear": {
        // 已下单的先归档再清，防止「开始下一餐」把订单弄丢
        if (await this.archiveAndClear()) return;
        snap.items = [];
        snap.locked = false;
        await this.env.DB.batch([
          this.env.DB.prepare(`DELETE FROM cart_item WHERE kitchen_id = ?`).bind(K),
          this.env.DB.prepare(
            `UPDATE cart_state SET locked = 0, locked_by = NULL, updated_at = ? WHERE kitchen_id = ?`,
          ).bind(now, K),
        ]);
        break;
      }
      case "lock": {
        // 下单只锁定并记下是谁，归档推迟到每日定时任务（或手动开始下一餐）
        await this.env.DB.prepare(
          `INSERT INTO cart_state (kitchen_id, locked, locked_by, updated_at) VALUES (?,1,?,?)
           ON CONFLICT(kitchen_id) DO UPDATE SET locked = 1, locked_by = excluded.locked_by,
             updated_at = excluded.updated_at`,
        )
          .bind(K, userId, now)
          .run();
        snap.locked = true;
        this.lockedBy = userId;
        this.lockedAt = now;
        if (snap.items.length)
          this.state.waitUntil(this.notifyOrder(who.name ?? null, snap.items));
        break;
      }
      case "unlock": {
        snap.locked = false;
        this.lockedBy = null;
        this.lockedAt = now;
        await this.env.DB.prepare(
          `UPDATE cart_state SET locked = 0, locked_by = NULL, updated_at = ? WHERE kitchen_id = ?`,
        )
          .bind(now, K)
          .run();
        break;
      }
    }
    snap.rev = ++this.rev;
  }

  /** 休眠前建立的旧连接没带 name，回表查一次 */
  private async nameOf(userId: string): Promise<string | null> {
    const r = await this.env.DB.prepare(`SELECT display_name AS n FROM user WHERE id = ?`)
      .bind(userId)
      .first<{ n: string }>();
    if (!r?.n) return "食客";
    if (r.n === "小客" || r.n.toLowerCase() === "guest") return "食客";
    return r.n;
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
