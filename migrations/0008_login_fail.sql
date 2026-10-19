-- 0008：登录失败计数，防暴力猜密码。key 为 'u:<用户名>' 或 'ip:<IP>'。
-- 窗口内失败次数到上限就暂时拒绝登录；定时任务清掉过期的行。
CREATE TABLE IF NOT EXISTS login_fail (
  key       TEXT PRIMARY KEY,
  fails     INTEGER NOT NULL,
  first_at  INTEGER NOT NULL
);
