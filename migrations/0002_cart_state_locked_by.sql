-- 下单只锁定，归档推迟到每日定时任务。记下谁下的单，归档时写进 meal.ordered_by。
-- 旧版本锁单时已经当场归档过，这些行 locked_by 为空，定时任务只清空、不重复归档。
ALTER TABLE cart_state ADD COLUMN locked_by TEXT;
