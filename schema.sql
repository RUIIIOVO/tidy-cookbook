-- D1 建表。跑一次：
--   pnpm exec wrangler d1 execute tidy-cookbook --remote --file=./schema.sql
--
-- 建完后用 scripts/seed-users.mjs 生成账号（密码自己定，别用示例里的）。

CREATE TABLE IF NOT EXISTS kitchen (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  pw_hash       TEXT NOT NULL,   -- PBKDF2-SHA256 / 10 万轮 / hex
  pw_salt       TEXT NOT NULL,   -- 16 字节 hex，每人独立
  role          TEXT NOT NULL CHECK (role IN ('owner','guest')),
  kitchen_id    TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_user ON session(user_id);

-- 活的点菜单，一个厨房一份
CREATE TABLE IF NOT EXISTS cart_item (
  kitchen_id  TEXT NOT NULL,
  dish_id     TEXT NOT NULL,
  qty         INTEGER NOT NULL,
  added_by    TEXT NOT NULL,
  added_at    INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (kitchen_id, dish_id)
);

CREATE TABLE IF NOT EXISTS cart_state (
  kitchen_id  TEXT PRIMARY KEY,
  locked      INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

-- 锁单即归档成一条历史订单
CREATE TABLE IF NOT EXISTS meal (
  id          TEXT PRIMARY KEY,
  kitchen_id  TEXT NOT NULL,
  ordered_by  TEXT NOT NULL,
  ordered_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_item (
  meal_id  TEXT NOT NULL,
  dish_id  TEXT NOT NULL,
  qty      INTEGER NOT NULL,
  PRIMARY KEY (meal_id, dish_id)
);
CREATE INDEX IF NOT EXISTS idx_meal_kitchen ON meal(kitchen_id, ordered_at DESC);

INSERT OR IGNORE INTO kitchen (id, name, created_at)
  VALUES ('main', '我家厨房', 0);
INSERT OR IGNORE INTO cart_state (kitchen_id, locked, updated_at)
  VALUES ('main', 0, 0);
