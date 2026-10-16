# 点菜单 → 下单 → 历史订单：改版规格

本文是这次改版的唯一需求来源。共享约定已写好，不要改动它们的语义：

- `src/lib/meal-time.ts`：就餐日期、餐别、切日、默认值规则
- `src/lib/protocol.ts`：前后端同步协议与数据类型

## 名词（只用这几个，不要造新词）

- **点菜单**：全家共用一份，正在挑的菜（原有概念，表 `cart_item`）。
- **订单 / 历史订单**：下单后生成，一个「日期 + 餐别」一张（表 `meal` + `meal_item`）。
  - 就餐日期 >= 今天的订单，界面上分组叫「待吃」；早于今天的叫「已吃」。都在「历史订单」页。
- **买菜清单**：只汇总「待吃」订单的食材。

## 规则

1. 去掉锁单：没有 locked / 重新编辑 / 下一餐。点菜单随时可改。
2. 下单：点菜单底部「下单」→ 弹出确认面板：菜名摘要 + 两行单选按钮
   - 第一行日期：昨天 / 今天 / 明天 / 后天（`pickableDays`），每个按钮下标具体日期（`shortDate`）
   - 第二行餐别：早餐 / 午餐 / 晚餐 / 宵夜
   - 默认选中 `defaultPick`；所选那一餐已有订单时提示「X 已有一单，会合并进去」
   - 选过去的餐 = 补录，正常允许（「昨天」就是为补录准备的，不做日期选择器）
   - 确认后：发 `placeOrder`（带面板里看到的 items），等 ack；成功则这些菜从点菜单移走
3. 同一「日期 + 餐别」最多一张订单，再下单就合并（份数相加，addedBy 保留第一个点的人）。
4. 编辑订单：点订单卡片上的「修改」打开编辑面板
   - 可改日期餐别（同一组单选，日期可选 = pickableDays ∪ 订单原日期）、加减份数、删菜、删除订单
   - 「＋ 加菜」打开独立的全屏选菜弹窗（搜索 + 分类），加的菜只进这张订单的编辑草稿，不碰点菜单
   - 所有改动只在面板内生效，点「保存」发一次 `saveMeal`（整单 + rev），等 ack
   - ack.code === "conflict" → 提示「刚被改过，已刷新」并关闭面板
   - 改到已有订单的另一餐 → 保存前提示会合并
   - 有未保存改动时关闭要确认
5. 权限：待吃订单所有人可改可删；已吃订单只有 owner 可改可删。下单（含补录）所有人可以。
6. 订单类操作（placeOrder / saveMeal / deleteMeal / buy）必须在线，离线时按钮置灰并提示「离线中」。
   点菜单的 set / removeMany / clear 仍走离线队列。
7. 凌晨 4 点定时任务：不再碰点菜单；只清理过期 op_seen、广播新快照（today 变了，昨天的订单离开「待吃」）。
8. 点菜单里的菜加入时间早于今天时，顶部提示「这几道是 5/16 放的」+ 清空按钮。
9. Bark 推送：下单、修改/删除待吃订单时推，标题带 `mealTitle`。改已吃订单不推。
10. 「点过 X 次」（dish_stat）：下单加；改单按差值加减；删单减；合并不变。与订单写入同一 batch。

## 数据库（migrations/0006_meal_slots.sql）

```sql
ALTER TABLE meal ADD COLUMN meal_date  TEXT;
ALTER TABLE meal ADD COLUMN slot       INTEGER;
ALTER TABLE meal ADD COLUMN rev        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meal ADD COLUMN updated_at INTEGER;
UPDATE meal SET meal_date = date((ordered_at/1000) + 4*3600, 'unixepoch'),
                slot = 3, updated_at = ordered_at WHERE meal_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_meal_day ON meal(kitchen_id, meal_date DESC, slot DESC);
DROP TABLE IF EXISTS shopping_done;
CREATE TABLE shopping_done (kitchen_id TEXT NOT NULL, meal_id TEXT NOT NULL, name TEXT NOT NULL,
  updated_at INTEGER NOT NULL, PRIMARY KEY (meal_id, name));
CREATE TABLE IF NOT EXISTS op_seen (op_id TEXT PRIMARY KEY, kitchen_id TEXT NOT NULL,
  meal_id TEXT, at INTEGER NOT NULL);
```

（`+8h-4h = +4h`：北京时间减去 4 点切日。）同一餐唯一由 Durable Object 保证，不建唯一索引（旧数据同一天可能有多条晚餐）。`cart_state` 保留不用。

## 模块分工

| 模块 | 负责文件 | 不许改 |
|---|---|---|
| A 服务端 | `migrations/0006_meal_slots.sql`、`schema.sql`、`worker/*`、`wrangler.jsonc` 注释 | `src/**`（除了只读引用） |
| B 前端数据层 | `src/lib/store.ts`、`src/lib/sync.ts`、`src/lib/history-store.ts`、`src/lib/shopping.ts`、新建 `src/components/meal-picker.tsx`；把 `add-button` / `custom-option-drawer` / `draw-view` / `dish-sheet` 里的 `locked` 判断删掉 | 视图的其他部分 |
| C 点菜单页 | `src/components/cart-view.tsx`、新建 `src/components/order-confirm-sheet.tsx`、`src/components/tab-bar.tsx`（「历史」角标显示待吃单数） | `history-view.tsx`、`menu-view.tsx` |
| D 历史订单页 | 新建 `src/components/pending-meals.tsx`、`src/components/meal-edit-sheet.tsx`、`src/components/dish-picker-sheet.tsx`；改 `src/components/shopping-list.tsx`；对 `history-view.tsx` 只做最小改动 | `menu-view.tsx` |

**冲突提醒**：另一个 agent 正在主目录改 `history-view.tsx`（历史页交互）和 `menu-view.tsx`（菜单动效）。
- 任何人都不要改 `menu-view.tsx`、`dish-card.tsx` 的动效相关代码。选菜弹窗是新组件，不复用 MenuView。
- `history-view.tsx` 只允许：挂载 `<PendingMeals />`、MealCard 标题改用 `mealTitle`、加「修改」按钮、去掉 `locked`。其余结构、动效、样式一行不动。

## 通用约定

见仓库根 `AGENTS.md`：颜色只用 token、图标只用 phosphor、标题 `font-display`、可点击卡片用 `div role="button"`、注释中文。
抽屉用已有的 `vaul`（参考 `custom-option-drawer.tsx`），确认框用 `useConfirm`，提示用 `sonner` 的 `toast`。
完成后跑 `pnpm exec tsc --noEmit -p .`、`pnpm cf:typecheck`、`pnpm lint`，只修自己负责文件里的错误。不要提交 git，交给验收。
