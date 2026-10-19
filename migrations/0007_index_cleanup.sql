-- 0007：索引整理。可重复执行。
--  - idx_meal_kitchen(kitchen_id, ordered_at) 没有任何查询用到，删掉省写入
--  - idx_meal_day 补上 id：历史分页按 (meal_date, slot, id) 倒序，补齐后不用临时排序
--  - op_seen / session 的定时清理按时间删，加索引免得全表扫
--  - cart_state 自 0006 起已弃用，代码不再读写，删表

DROP INDEX IF EXISTS idx_meal_kitchen;

DROP INDEX IF EXISTS idx_meal_day;
CREATE INDEX IF NOT EXISTS idx_meal_day ON meal(kitchen_id, meal_date, slot, id);

CREATE INDEX IF NOT EXISTS idx_op_seen_at ON op_seen(kitchen_id, at);
CREATE INDEX IF NOT EXISTS idx_session_expires ON session(expires_at);

DROP TABLE IF EXISTS cart_state;
