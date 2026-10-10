-- 买菜清单的勾选状态，一个厨房一份，所有人共享。随点菜单清空一起清掉。
CREATE TABLE IF NOT EXISTS shopping_done (
  kitchen_id  TEXT NOT NULL,
  name        TEXT NOT NULL,      -- 食材名；清单按食材名合并，名字就是唯一键
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (kitchen_id, name)
);
