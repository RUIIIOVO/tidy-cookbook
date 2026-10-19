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
  normalizeName,
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

import { isMealDate, mealDayOf } from "../src/lib/meal-time";

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
  let query = `SELECT m.id, m.meal_date AS mealDate, m.slot, m.rev, m.ordered_at AS orderedAt,
                      m.updated_at AS updatedAt, u.display_name AS orderedBy
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
    .all<{
      id: string;
      mealDate: string;
      slot: number;
      rev: number;
      orderedAt: number;
      updatedAt: number | null;
      orderedBy: string | null;
    }>();

  const rawRows = meals.results ?? [];
  const hasMore = rawRows.length > limit;
  const rows = hasMore ? rawRows.slice(0, limit) : rawRows;

  if (!rows.length) {
    return { meals: [], nextCursor: null, hasMore: false };
  }

  const marks = rows.map(() => "?").join(",");
  const items = await db
    .prepare(
      `SELECT i.meal_id AS mealId, i.dish_id AS dishId, i.qty,
              i.added_by AS addedById, u.display_name AS addedBy
         FROM meal_item i LEFT JOIN user u ON u.id = i.added_by
        WHERE i.meal_id IN (${marks}) ORDER BY i.rowid`,
    )
    .bind(...rows.map((m) => m.id))
    .all<{ mealId: string; dishId: string; qty: number; addedById: string | null; addedBy: string | null }>();

  type Item = { dishId: string; qty: number; addedById: string | null; addedBy: string | null };
  const byMeal = new Map<string, Item[]>();
  for (const it of items.results ?? []) {
    const arr = byMeal.get(it.mealId) ?? [];
    arr.push({ dishId: it.dishId, qty: it.qty, addedById: it.addedById, addedBy: normalizeName(it.addedBy) });
    byMeal.set(it.mealId, arr);
  }

  const resultMeals = rows.map((m) => ({
    id: m.id,
    mealDate: m.mealDate,
    slot: m.slot,
    rev: m.rev,
    orderedAt: m.orderedAt,
    orderedBy: normalizeName(m.orderedBy),
    updatedAt: m.updatedAt ?? m.orderedAt,
    items: byMeal.get(m.id) ?? [],
  }));

  const last = rows[rows.length - 1];
  const nextCursor = hasMore ? `${last.mealDate}|${last.slot}|${last.id}` : null;

  return { meals: resultMeals, nextCursor, hasMore };
}
