-- 0006：下单改版。订单按「就餐日期 + 餐别」存，去掉锁单，买菜勾选改挂订单，新增幂等表。
-- 只能对旧结构（0005 之后）跑一次；新库直接用 schema.sql，不要再跑本文件。
-- 同一餐唯一由 Durable Object 保证，不建唯一索引（旧数据同一天可能有多条晚餐）。
-- cart_state 保留不用。

ALTER TABLE meal ADD COLUMN meal_date  TEXT;
ALTER TABLE meal ADD COLUMN slot       INTEGER;
ALTER TABLE meal ADD COLUMN rev        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meal ADD COLUMN updated_at INTEGER;

-- 旧订单一律当晚餐。北京时间 = UTC+8，再按凌晨 4 点切日 = UTC+4h
UPDATE meal SET meal_date = date((ordered_at / 1000) + 4 * 3600, 'unixepoch'),
                slot = 3,
                updated_at = ordered_at
 WHERE meal_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_meal_day ON meal(kitchen_id, meal_date DESC, slot DESC);

-- 买菜勾选改成按订单记；旧的按厨房记的勾选没法对应到订单，直接丢弃（下次勾一遍就行）
DROP TABLE IF EXISTS shopping_done;
CREATE TABLE shopping_done (
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
