-- 历史订单记住每道菜是谁点的。已建库的跑一次：
--   pnpm exec wrangler d1 execute tidy-cookbook --remote --file=./migrations/0001_meal_item_added_by.sql
ALTER TABLE meal_item ADD COLUMN added_by TEXT;
