/**
 * /api/*  由本 Worker 处理；其余路径交给 ASSETS（静态资源免费且不计请求配额）。
 * 路由分流由 wrangler.jsonc 的 assets.run_worker_first 控制。
 */
import {
  CLEAR_COOKIE,
  login,
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

    const token = readToken(req);

    try {
      // ── 不需要登录 ────────────────────────────────
      if (url.pathname === "/api/login" && req.method === "POST") {
        const { username, password } = (await req.json()) as {
          username?: string;
          password?: string;
        };
        if (!username || !password) return json({ error: "请填用户名和密码" }, { status: 400 });
        const r = await login(env.DB, username.trim(), password);
        if (!r) return json({ error: "用户名或密码不对" }, { status: 401 });
        return json(
          { user: r.user, token: r.token },
          { headers: { "Set-Cookie": sessionCookie(r.token) } },
        );
      }

      if (url.pathname === "/api/register" && req.method === "POST") {
        const { username, password, displayName } = (await req.json()) as {
          username?: string;
          password?: string;
          displayName?: string;
        };
        if (!username || !password) return json({ error: "请填用户名和密码" }, { status: 400 });
        const r = await register(env.DB, username.trim(), password, displayName ?? username);
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

      if (url.pathname === "/api/history" && req.method === "GET")
        return json({ meals: await listHistory(env.DB, user.kitchenId) });

      if (url.pathname === "/api/history" && req.method === "DELETE") {
        if (user.role !== "owner")
          return json({ error: "只有 rui 和 hui 能删历史" }, { status: 403 });
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "缺少 id" }, { status: 400 });
        await env.DB.batch([
          env.DB.prepare(`DELETE FROM meal_item WHERE meal_id = ?`).bind(id),
          env.DB.prepare(`DELETE FROM meal WHERE id = ? AND kitchen_id = ?`).bind(
            id,
            user.kitchenId,
          ),
        ]);
        return json({ ok: true });
      }

      return json({ error: "没有这个接口" }, { status: 404 });
    } catch (e) {
      return json({ error: String(e) }, { status: 500 });
    }
  },
  /** 每天北京时间凌晨 4 点（UTC 20:00）：点菜单归档进历史并清空（没确认下单但有菜的也算） */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
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
  return stub.fetch(new Request(u.toString(), req)).then((res) => {
    // 客户端用子协议带令牌时，握手必须原样回显，否则浏览器会断开
    const proto = wsProtocol(req);
    if (res.status !== 101 || !proto) return res;
    const headers = new Headers(res.headers);
    headers.set("Sec-WebSocket-Protocol", proto);
    return new Response(null, { status: 101, webSocket: res.webSocket, headers });
  });
}

async function listHistory(db: D1Database, kitchenId: string) {
  const meals = await db
    .prepare(
      `SELECT m.id, m.ordered_at AS orderedAt, u.display_name AS orderedBy
         FROM meal m LEFT JOIN user u ON u.id = m.ordered_by
        WHERE m.kitchen_id = ? ORDER BY m.ordered_at DESC LIMIT 100`,
    )
    .bind(kitchenId)
    .all<{ id: string; orderedAt: number; orderedBy: string | null }>();

  const rows = meals.results ?? [];
  if (!rows.length) return [];

  const marks = rows.map(() => "?").join(",");
  const items = await db
    .prepare(
      `SELECT i.meal_id AS mealId, i.dish_id AS dishId, i.qty, u.display_name AS addedBy
         FROM meal_item i LEFT JOIN user u ON u.id = i.added_by
        WHERE i.meal_id IN (${marks})`,
    )
    .bind(...rows.map((m) => m.id))
    .all<{ mealId: string; dishId: string; qty: number; addedBy: string | null }>();

  const normalize = (n?: string | null) => {
    if (!n) return null;
    return n === "小客" || n.toLowerCase() === "guest" ? "食客" : n;
  };

  type Item = { dishId: string; qty: number; addedBy: string | null };
  const byMeal = new Map<string, Item[]>();
  for (const it of items.results ?? []) {
    const arr = byMeal.get(it.mealId) ?? [];
    arr.push({ dishId: it.dishId, qty: it.qty, addedBy: normalize(it.addedBy) });
    byMeal.set(it.mealId, arr);
  }
  return rows.map((m) => ({
    ...m,
    orderedBy: normalize(m.orderedBy),
    items: byMeal.get(m.id) ?? [],
  }));
}
