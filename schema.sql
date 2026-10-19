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
CREATE INDEX IF NOT EXISTS idx_session_expires ON session(expires_at);

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

-- 订单：一个「就餐日期 + 餐别」一张，同一餐唯一由 KitchenDO 保证（不建唯一索引，旧数据可能重复）。
-- meal_date >= 今天（凌晨 4 点切日）叫「待吃」，更早的叫「已吃」。
CREATE TABLE IF NOT EXISTS meal (
  id          TEXT PRIMARY KEY,
  kitchen_id  TEXT NOT NULL,
  ordered_by  TEXT NOT NULL,
  ordered_at  INTEGER NOT NULL,
  meal_date   TEXT NOT NULL,              -- 'YYYY-MM-DD'，北京时间
  slot        INTEGER NOT NULL,           -- 1 早餐 2 午餐 3 晚餐 4 宵夜
  rev         INTEGER NOT NULL DEFAULT 1, -- 乐观锁版本号，每次改动 +1
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_item (
  meal_id  TEXT NOT NULL,
  dish_id  TEXT NOT NULL,
  qty      INTEGER NOT NULL,
  added_by TEXT,                 -- 第一个点这道菜的 user.id；老记录为空
  PRIMARY KEY (meal_id, dish_id)
);
-- 菜品历史累计点单统计（O(1) 极速读取）
CREATE TABLE IF NOT EXISTS dish_stat (
  kitchen_id  TEXT NOT NULL,
  dish_id     TEXT NOT NULL,
  order_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kitchen_id, dish_id)
);

CREATE INDEX IF NOT EXISTS idx_meal_day ON meal(kitchen_id, meal_date, slot, id);

-- 买菜清单的勾选：某张订单的某个食材已买，所有人共享；订单删除时一起删
CREATE TABLE IF NOT EXISTS shopping_done (
  kitchen_id  TEXT NOT NULL,
  meal_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (meal_id, name)
);

-- 订单类操作的幂等记录：reqId 处理过就不再执行；定时任务清掉 3 天前的
CREATE TABLE IF NOT EXISTS op_seen (
  op_id       TEXT PRIMARY KEY,
  kitchen_id  TEXT NOT NULL,
  meal_id     TEXT,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_op_seen_at ON op_seen(kitchen_id, at);

-- 登录失败计数，防暴力猜密码。key 为 'u:<用户名>' 或 'ip:<IP>'
CREATE TABLE IF NOT EXISTS login_fail (
  key       TEXT PRIMARY KEY,
  fails     INTEGER NOT NULL,
  first_at  INTEGER NOT NULL
);

INSERT OR IGNORE INTO kitchen (id, name, created_at)
  VALUES ('main', '我家厨房', 0);
