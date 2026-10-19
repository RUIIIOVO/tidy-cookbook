-- 订单与菜品点评表：家庭共用一份，支持修改
CREATE TABLE IF NOT EXISTS meal_review (
  meal_id       TEXT PRIMARY KEY,
  kitchen_id    TEXT NOT NULL,
  rating        INTEGER NOT NULL,          -- 1~5 星
  rating_text   TEXT NOT NULL,             -- "夯爆了" | "顶级" | "人上人" | "NPC" | "拉完了"
  tags          TEXT,                      -- JSON 数组字符串，如 '["下饭神器"]'
  dish_ratings  TEXT,                      -- JSON 字典字符串，如 '{"88": 5}'
  comment       TEXT,                      -- 点评内容
  reviewed_by   TEXT NOT NULL,             -- 最后点评人显示名
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meal_review_kitchen ON meal_review(kitchen_id);
