/** 账号与会话。PBKDF2-SHA256 / 10 万轮 / 每人独立 16 字节 salt。 */

const ITER = 100_000;
const SESSION_DAYS = 90;

export type Role = "owner" | "guest";
export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  kitchenId: string;
};

const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

const unhex = (s: string) =>
  new Uint8Array(s.match(/.{2}/g)!.map((x) => parseInt(x, 16)));

export async function derive(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: ITER },
    key,
    256,
  );
  return hex(bits);
}

/** 定长比较，避免按字符提前返回泄漏信息 */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomHex(bytes: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
}

export async function login(
  db: D1Database,
  username: string,
  password: string,
): Promise<{ token: string; user: SessionUser } | null> {
  const row = await db
    .prepare(
      `SELECT id, username, display_name, pw_hash, pw_salt, role, kitchen_id
         FROM user WHERE username = ?`,
    )
    .bind(username)
    .first<{
      id: string;
      username: string;
      display_name: string;
      pw_hash: string;
      pw_salt: string;
      role: Role;
      kitchen_id: string;
    }>();
  if (!row) {
    // 用户不存在时也跑一次 KDF，让耗时和存在时一致
    await derive(password, "00".repeat(16));
    return null;
  }
  const got = await derive(password, row.pw_salt);
  if (!sameSecret(got, row.pw_hash)) return null;

  const token = randomHex(32);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO session (token, user_id, expires_at, created_at) VALUES (?,?,?,?)`,
    )
    .bind(token, row.id, now + SESSION_DAYS * 86400_000, now)
    .run();

  return {
    token,
    user: {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      kitchenId: row.kitchen_id,
    },
  };
}

/** 注册。一律 guest 角色，并入同一个厨房。 */
export async function register(
  db: D1Database,
  username: string,
  password: string,
  displayName: string,
  kitchenId = "main",
): Promise<{ token: string; user: SessionUser } | { error: string }> {
  if (!/^[a-zA-Z0-9_]{2,16}$/.test(username))
    return { error: "用户名只能用 2-16 位字母、数字或下划线" };
  if (password.length < 6) return { error: "密码至少 6 位" };

  const dup = await db
    .prepare(`SELECT 1 FROM user WHERE username = ?`)
    .bind(username)
    .first();
  if (dup) return { error: "这个用户名已经有人用了" };

  const salt = randomHex(16);
  const pwHash = await derive(password, salt);
  const now = Date.now();
  const id = randomHex(8);

  await db
    .prepare(
      `INSERT INTO user (id, username, display_name, pw_hash, pw_salt, role, kitchen_id, created_at)
       VALUES (?,?,?,?,?,'guest',?,?)`,
    )
    .bind(id, username, displayName.trim() || username, pwHash, salt, kitchenId, now)
    .run();

  const token = randomHex(32);
  await db
    .prepare(
      `INSERT INTO session (token, user_id, expires_at, created_at) VALUES (?,?,?,?)`,
    )
    .bind(token, id, now + SESSION_DAYS * 86400_000, now)
    .run();

  return {
    token,
    user: {
      id,
      username,
      displayName: displayName.trim() || username,
      role: "guest",
      kitchenId,
    },
  };
}

export async function resolveSession(
  db: D1Database,
  token: string | null,
): Promise<SessionUser | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.role, u.kitchen_id, s.expires_at
         FROM session s JOIN user u ON u.id = s.user_id
        WHERE s.token = ?`,
    )
    .bind(token)
    .first<{
      id: string;
      username: string;
      display_name: string;
      role: Role;
      kitchen_id: string;
      expires_at: number;
    }>();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await db.prepare(`DELETE FROM session WHERE token = ?`).bind(token).run();
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    kitchenId: row.kitchen_id,
  };
}

export async function logout(db: D1Database, token: string | null) {
  if (token) await db.prepare(`DELETE FROM session WHERE token = ?`).bind(token).run();
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("Cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function sessionCookie(token: string): string {
  return `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export const CLEAR_COOKIE = "sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
