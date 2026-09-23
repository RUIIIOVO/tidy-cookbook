#!/usr/bin/env node
/**
 * 生成账号的 INSERT 语句（PBKDF2-SHA256 / 10 万轮，和 worker/auth.ts 一致）。
 *
 *   node scripts/seed-users.mjs alice:你的密码:owner bob:另一个密码:guest \
 *     > /tmp/seed.sql
 *   pnpm exec wrangler d1 execute tidy-cookbook --remote --file=/tmp/seed.sql
 *
 * 密码只在本地参与计算，落库的是 hash + 每人独立的随机 salt。
 * 生成的 .sql 里含明文密码的哈希，用完删掉，别提交。
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";

const args = process.argv.slice(2);
if (!args.length) {
  console.error("用法: node scripts/seed-users.mjs 用户名:密码:owner|guest ...");
  process.exit(1);
}

const now = Date.now();
const KITCHEN = process.env.KITCHEN_ID ?? "main";

for (const arg of args) {
  const [username, password, role = "guest", displayName] = arg.split(":");
  if (!username || !password) {
    console.error(`跳过格式不对的参数: ${arg}`);
    continue;
  }
  if (role !== "owner" && role !== "guest") {
    console.error(`角色只能是 owner 或 guest: ${arg}`);
    process.exit(1);
  }
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, Buffer.from(salt, "hex"), 100_000, 32, "sha256")
    .toString("hex");
  const id = randomBytes(8).toString("hex");
  const name =
    displayName || (username.toLowerCase() === "guest" || role === "guest" ? "食客" : username);
  console.log(
    `INSERT OR REPLACE INTO user (id,username,display_name,pw_hash,pw_salt,role,kitchen_id,created_at) ` +
      `VALUES ('${id}','${username}','${name}','${hash}','${salt}','${role}','${KITCHEN}',${now});`,
  );
}
