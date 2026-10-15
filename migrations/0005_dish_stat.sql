-- 菜品历史点菜累计统计表：O(1) 极速读取，杜绝动态扫表聚合的性能开销
CREATE TABLE IF NOT EXISTS dish_stat (
  kitchen_id  TEXT NOT NULL,
  dish_id     TEXT NOT NULL,
  order_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kitchen_id, dish_id)
);

-- 初始化回填：自动从已有历史订单中聚合累计点菜总次数
INSERT OR REPLACE INTO dish_stat (kitchen_id, dish_id, order_count)
SELECT m.kitchen_id, mi.dish_id, SUM(mi.qty)
FROM meal_item mi
JOIN meal m ON m.id = mi.meal_id
GROUP BY m.kitchen_id, mi.dish_id;
