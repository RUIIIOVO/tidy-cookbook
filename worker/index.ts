/**
 * /api/*  由本 Worker 处理；其余路径交给 ASSETS（静态资源免费且不计请求配额）。
 * 路由分流由 wrangler.jsonc 的 assets.run_worker_first 控制。
 */
import {
  CLEAR_COOKIE,
  clearLoginFail,
  FAIL_WINDOW_MS,
  login,
  loginBlockedFor,
  recordLoginFail,
  logout,
  readCookie,
  readToken,
  wsProtocol,
  register,
  renewSession,
  resolveSession,
  sessionCookie,
  type SessionUser,
} from "./auth";

import { addDays, isMealDate, mealDayOf } from "../src/lib/meal-time";
import {
  assembleMeals,
  ITEM_COLS,
  MEAL_COLS,
  REVIEW_COLS,
  type ItemRow,
  type MealRow,
  type ReviewRow,
} from "./meals";

export { KitchenDO } from "./kitchen-do";

export interface Env {
  DB: D1Database;
  KITCHEN: DurableObjectNamespace;
  ASSETS: Fetcher;
  /** Bark 推送地址（wrangler secret），没配就不推 */
  BARK_URL?: string;
}

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json; charset=utf-8", ...init.headers },
  });

/** 请求体不是合法 JSON 对象时当空对象，由各接口自己报「缺字段」 */
async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * 浏览器发起的跨站请求一律拒绝（重点是 WebSocket 握手，它不受 CORS 约束）。
 * 没有 Origin 的（curl、脚本）放行，它们本来就带不上别人的 cookie。
 */
function crossSite(req: Request, url: URL): boolean {
  const origin = req.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== url.host;
  } catch {
    return true;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) {
      const res = await env.ASSETS.fetch(req);
      if (
        url.pathname.startsWith("/images/") ||
        url.pathname.startsWith("/_next/static/")
      ) {
        const headers = new Headers(res.headers);
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        });
      }
      return res;
    }

    if (crossSite(req, url)) return json({ error: "不允许跨站请求" }, { status: 403 });

    const token = readToken(req);

    try {
      // ── 不需要登录 ────────────────────────────────
      if (url.pathname === "/api/login" && req.method === "POST") {
        const body = await readBody(req);
        const username = str(body.username).trim();
        const password = str(body.password);
        if (!username || !password) return json({ error: "请填用户名和密码" }, { status: 400 });
        const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
        const wait = await loginBlockedFor(env.DB, username, ip);
        if (wait > 0)
          return json(
            { error: `尝试次数太多，请 ${Math.ceil(wait / 60_000)} 分钟后再试` },
            { status: 429, headers: { "Retry-After": String(Math.ceil(wait / 1000)) } },
          );
        const r = await login(env.DB, username, password);
        if (!r) {
          await recordLoginFail(env.DB, username, ip);
          return json({ error: "用户名或密码错误" }, { status: 401 });
        }
        await clearLoginFail(env.DB, username);
        return json(
          { user: r.user, token: r.token },
          { headers: { "Set-Cookie": sessionCookie(r.token) } },
        );
      }

      if (url.pathname === "/api/register" && req.method === "POST") {
        const body = await readBody(req);
        const username = str(body.username).trim();
        const password = str(body.password);
        if (!username || !password) return json({ error: "请填用户名和密码" }, { status: 400 });
        const r = await register(env.DB, username, password, str(body.displayName) || username);
        if ("error" in r) return json(r, { status: 400 });
        return json(
          { user: r.user, token: r.token },
          { headers: { "Set-Cookie": sessionCookie(r.token) } },
        );
      }

      if (url.pathname === "/api/logout" && req.method === "POST") {
        await logout(env.DB, token);
        return json({ ok: true }, { headers: { "Set-Cookie": CLEAR_COOKIE } });
      }

      // ── 以下都要登录 ──────────────────────────────
      const user = await resolveSession(env.DB, token);
      if (!user) return json({ error: "未登录" }, { status: 401 });

      if (url.pathname === "/api/me") {
        // 每次打开都顺手续期；cookie 被浏览器清掉时（只靠 localStorage 令牌认出来的），也一并补发
        const renewed = await renewSession(env.DB, token);
        const cookieLost = readCookie(req, "sid") !== token;
        // 同时把令牌回给客户端：升级前登录的老用户本地没存过，借这次补上
        return json(
          { user, token },
          (renewed || cookieLost) && token
            ? { headers: { "Set-Cookie": sessionCookie(token) } }
            : {},
        );
      }

      if (url.pathname === "/api/sync") return connectKitchen(req, env, user);

      if (url.pathname === "/api/history" && req.method === "GET") {
        const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 15)));
        const before = parseCursor(url.searchParams.get("before"));
        if (before === "bad") return json({ error: "before 格式不对" }, { status: 400 });
        const since = url.searchParams.get("since");
        if (since && !isMealDate(since)) return json({ error: "since 要是 YYYY-MM-DD" }, { status: 400 });
        return json(await listHistory(env.DB, user.kitchenId, limit, before, since || null));
      }

      if (url.pathname === "/api/history/heatmap" && req.method === "GET") {
        // 按 [from, to] 闭区间聚合（前端按自然年拉取）；兼容旧参数 days + since
        let from = url.searchParams.get("from");
        let to = url.searchParams.get("to");
        if (!from || !to) {
          const days = Math.min(366, Math.max(7, Number(url.searchParams.get("days") || 90)));
          to = url.searchParams.get("since") || mealDayOf(Date.now());
          from = isMealDate(to) ? addDays(to, -days) : null;
        }
        if (!from || !to || !isMealDate(from) || !isMealDate(to) || from > to)
          return json({ error: "from / to 要是 YYYY-MM-DD" }, { status: 400 });
        if (addDays(from, 400) < to) return json({ error: "区间太长" }, { status: 400 });
        return json({ heatmap: await getCookingHeatmap(env.DB, user.kitchenId, from, to) });
      }

      // 按订单 id 批量取点评：今天已吃完的几餐来自实时快照，快照不带点评，由前端单独补拉
      if (url.pathname === "/api/reviews" && req.method === "GET") {
        const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 20);
        if (!ids.length) return json({ reviews: [] });
        const marks = ids.map(() => "?").join(",");
        const rows = await env.DB.prepare(
          `SELECT ${REVIEW_COLS} FROM meal_review r WHERE r.kitchen_id = ? AND r.meal_id IN (${marks})`,
        )
          .bind(user.kitchenId, ...ids)
          .all<ReviewRow>();
        const meals = assembleMeals(
          (rows.results ?? []).map((r) => ({
            id: r.mealId, mealDate: "", slot: 1, rev: 0, orderedAt: 0, updatedAt: 0, orderedBy: null,
          })),
          [],
          rows.results ?? [],
        );
        return json({ reviews: meals.map((m) => m.review).filter(Boolean) });
      }

      if (url.pathname === "/api/reviews" && req.method === "POST") {
        const body = await readBody(req);
        const mealId = str(body.mealId).trim();
        const rating = Number(body.rating);
        const comment = str(body.comment).trim().slice(0, 200);
        // 标签：去空白、去重，每个最多 8 个字（客户端限 6），最多 16 个
        const tags = [
          ...new Set(
            (Array.isArray(body.tags) ? body.tags : [])
              .filter((t): t is string => typeof t === "string")
              .map((t) => t.trim())
              .filter((t) => t && [...t].length <= 8),
          ),
        ].slice(0, 16);
        // 单菜星级只收 1~5 的整数
        const dishRatings: Record<string, number> = {};
        const rawDish = body.dishRatings && typeof body.dishRatings === "object" ? (body.dishRatings as Record<string, unknown>) : {};
        for (const [k, v] of Object.entries(rawDish).slice(0, 40)) {
          if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5) dishRatings[k] = v;
        }

        if (!mealId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
          return json({ error: "点评信息不完整或格式有误" }, { status: 400 });
        }
        // 档位文案以服务端为准，不信客户端传的
        const ratingText = ["", "拉完了", "NPC", "人上人", "顶级", "夯爆了"][rating];

        // 校验 meal 归属
        const meal = await env.DB.prepare(`SELECT id FROM meal WHERE id = ? AND kitchen_id = ?`)
          .bind(mealId, user.kitchenId)
          .first();
        if (!meal) return json({ error: "未找到该订单" }, { status: 404 });

        const now = Date.now();
        await env.DB.prepare(
          `INSERT INTO meal_review (meal_id, kitchen_id, rating, rating_text, tags, dish_ratings, comment, reviewed_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(meal_id) DO UPDATE SET
             rating = excluded.rating,
             rating_text = excluded.rating_text,
             tags = excluded.tags,
             dish_ratings = excluded.dish_ratings,
             comment = excluded.comment,
             reviewed_by = excluded.reviewed_by,
             updated_at = excluded.updated_at`,
        )
          .bind(
            mealId,
            user.kitchenId,
            rating,
            ratingText,
            JSON.stringify(tags),
            JSON.stringify(dishRatings),
            comment,
            user.displayName,
            now,
          )
          .run();

        return json({
          ok: true,
          review: {
            mealId,
            rating,
            ratingText,
            tags,
            dishRatings,
            comment,
            reviewedBy: user.displayName,
            updatedAt: now,
          },
        });
      }

      if (url.pathname === "/api/reviews" && req.method === "DELETE") {
        const body = await readBody(req);
        const mealId = str(body.mealId).trim();
        if (!mealId) return json({ error: "缺少 mealId" }, { status: 400 });

        await env.DB.prepare(`DELETE FROM meal_review WHERE meal_id = ? AND kitchen_id = ?`)
          .bind(mealId, user.kitchenId)
          .run();

        return json({ ok: true, mealId });
      }

      // 删订单改走 WebSocket 的 deleteMeal（要幂等、要同步 dish_stat 和勾选）

      return json({ error: "没有这个接口" }, { status: 404 });
    } catch (e) {
      // 内部报错只进日志，不把 SQL / 堆栈回给客户端
      console.error("api failed", url.pathname, e);
      return json({ error: "服务器出错了，请重试" }, { status: 500 });
    }
  },
  /** 每天北京时间凌晨 4 点（UTC 20:00）：清理过期会话和 op_seen、广播新快照，不碰点菜单 */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        // 没人再用的过期会话不会被 resolveSession 碰到，只能在这里清
        const s = await env.DB.prepare(`DELETE FROM session WHERE expires_at < ?`).bind(Date.now()).run();
        const f = await env.DB.prepare(`DELETE FROM login_fail WHERE first_at < ?`)
          .bind(Date.now() - FAIL_WINDOW_MS)
          .run();
        console.log("purged session", s.meta?.changes ?? 0, "login_fail", f.meta?.changes ?? 0);
        const kitchens = await env.DB.prepare(`SELECT id FROM kitchen`).all<{ id: string }>();
        for (const k of kitchens.results ?? []) {
          const stub = env.KITCHEN.get(env.KITCHEN.idFromName(k.id));
          const r = await stub.fetch(`https://kitchen/rollover?kitchen=${encodeURIComponent(k.id)}`);
          console.log("rollover", k.id, await r.text());
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;

function connectKitchen(req: Request, env: Env, user: SessionUser): Promise<Response> {
  if (req.headers.get("Upgrade") !== "websocket")
    return Promise.resolve(json({ error: "这个接口要 WebSocket" }, { status: 426 }));
  const id = env.KITCHEN.idFromName(user.kitchenId);
  const stub = env.KITCHEN.get(id);
  const u = new URL(req.url);
  u.searchParams.set("kitchen", user.kitchenId);
  u.searchParams.set("uid", user.id);
  u.searchParams.set("role", user.role);
  u.searchParams.set("name", user.displayName);
  // 客户端协议版本原样透传，缺失就当旧页面
  u.searchParams.set("v", u.searchParams.get("v") ?? "0");
  return stub.fetch(new Request(u.toString(), req)).then((res) => {
    // 客户端用子协议带令牌时，握手必须原样回显，否则浏览器会断开
    const proto = wsProtocol(req);
    if (res.status !== 101 || !proto) return res;
    const headers = new Headers(res.headers);
    headers.set("Sec-WebSocket-Protocol", proto);
    return new Response(null, { status: 101, webSocket: res.webSocket, headers });
  });
}

/** 游标 'meal_date|slot|id'，前端原样回传 */
type Cursor = { date: string; slot: number; id: string };
function parseCursor(raw: string | null): Cursor | null | "bad" {
  if (!raw) return null;
  const [date, slot, ...rest] = raw.split("|");
  const id = rest.join("|");
  if (!isMealDate(date) || !/^[1-4]$/.test(slot ?? "") || !id) return "bad";
  return { date, slot: Number(slot), id };
}

/** 已吃的订单（meal_date < 今天），新的在前。游标翻页，since（YYYY-MM-DD）只看这天及以后 */
async function listHistory(
  db: D1Database,
  kitchenId: string,
  limit = 15,
  before: Cursor | null = null,
  since: string | null = null,
) {
  const today = mealDayOf(Date.now());
  let query = `SELECT ${MEAL_COLS}
         FROM meal m LEFT JOIN user u ON u.id = m.ordered_by
        WHERE m.kitchen_id = ? AND m.meal_date < ?`;
  const binds: unknown[] = [kitchenId, today];

  if (since) {
    query += ` AND m.meal_date >= ?`;
    binds.push(since);
  }
  if (before) {
    query += ` AND (m.meal_date < ? OR (m.meal_date = ? AND (m.slot < ? OR (m.slot = ? AND m.id < ?))))`;
    binds.push(before.date, before.date, before.slot, before.slot, before.id);
  }

  // 多查 1 条用以判断是否还有后续页
  query += ` ORDER BY m.meal_date DESC, m.slot DESC, m.id DESC LIMIT ?`;
  binds.push(limit + 1);

  const meals = await db
    .prepare(query)
    .bind(...binds)
    .all<MealRow>();

  const rawRows = meals.results ?? [];
  const hasMore = rawRows.length > limit;
  const rows = hasMore ? rawRows.slice(0, limit) : rawRows;

  if (!rows.length) {
    return { meals: [], nextCursor: null, hasMore: false };
  }

  const marks = rows.map(() => "?").join(",");
  const [items, reviews] = await Promise.all([
    db
      .prepare(
        `SELECT ${ITEM_COLS}
           FROM meal_item i LEFT JOIN user u ON u.id = i.added_by
          WHERE i.meal_id IN (${marks}) ORDER BY i.rowid`,
      )
      .bind(...rows.map((m) => m.id))
      .all<ItemRow>(),
    db
      .prepare(
        `SELECT ${REVIEW_COLS}
           FROM meal_review r
          WHERE r.meal_id IN (${marks})`,
      )
      .bind(...rows.map((m) => m.id))
      .all<ReviewRow>(),
  ]);

  const resultMeals = assembleMeals(rows, items.results ?? [], reviews.results ?? []);

  const last = rows[rows.length - 1];
  const nextCursor = hasMore ? `${last.mealDate}|${last.slot}|${last.id}` : null;

  return { meals: resultMeals, nextCursor, hasMore };
}

/** [from, to] 区间内每天的下厨聚合：几餐、几道菜、点评均分 */
async function getCookingHeatmap(db: D1Database, kitchenId: string, from: string, to: string) {
  // meal_review 以 meal_id 为主键，LEFT JOIN 是一对一，不会把行数放大；菜品数用子查询单独数
  const res = await db
    .prepare(
      `SELECT m.meal_date AS mealDate,
              COUNT(*) AS mealCount,
              SUM((SELECT COUNT(*) FROM meal_item i WHERE i.meal_id = m.id)) AS dishCount,
              COUNT(r.meal_id) AS reviewCount,
              AVG(r.rating) AS avgRating
         FROM meal m
         LEFT JOIN meal_review r ON r.meal_id = m.id
        WHERE m.kitchen_id = ? AND m.meal_date >= ? AND m.meal_date <= ?
        GROUP BY m.meal_date`,
    )
    .bind(kitchenId, from, to)
    .all<{ mealDate: string; mealCount: number; dishCount: number; reviewCount: number; avgRating: number | null }>();

  const map: Record<string, { mealCount: number; dishCount: number; hasReview: boolean; avgRating: number | null }> = {};
  for (const row of res.results ?? []) {
    map[row.mealDate] = {
      mealCount: row.mealCount,
      dishCount: row.dishCount ?? 0,
      hasReview: row.reviewCount > 0,
      avgRating: row.avgRating == null ? null : Math.round(row.avgRating * 10) / 10,
    };
  }
  return map;
}
