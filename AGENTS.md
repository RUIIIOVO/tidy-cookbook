# tidy-cookbook

移动端优先的家常菜谱 / 点菜 H5。菜品是构建期静态数据，点菜单存 localStorage，无后端。

## 命令

```bash
pnpm dev                       # 开发服务
pnpm build                     # 生产构建
pnpm lint                      # ESLint
node scripts/build-pinyin.mjs  # 改过 src/data/raw.ts 后必须重跑
```

## 结构

| 路径 | 职责 |
| --- | --- |
| `src/data/raw.ts` | 菜品源数据，唯一手写入口 |
| `src/data/pinyin.generated.json` | 脚本生成的拼音 / 首字母（以数字 id 为键） |
| `src/data/legacy-ids.json` | 旧拼音 id → 数字 id 对照，仅用于兼容旧缓存，不再新增 |
| `src/data/dishes.ts` | 解析出 `dishes` / `sections` / 分类 |
| `src/lib/` | search · store · ui-store · shopping · theme · icons · utils |
| `src/components/` | 视图与交互组件 |
| `src/app/(tabs)/` | 四个 tab：`/` `/menu` `/cart` `/history` |
| `scripts/gen-dish-images.py` | 菜品配图生成（风格锁在 `scripts/style_lock.txt`） |

## 约定

- 加菜只改 `src/data/raw.ts`，再跑 `node scripts/build-pinyin.mjs`。`pinyin.generated.json` 不手改。
- 菜品 id 是 `raw.ts` 每行开头手写的数字，递增分配；一经使用永不改、不复用、不重排（点菜单、历史订单、配图文件名都靠它）。删菜也不要回收编号。
- 菜品描述只写吃起来什么样，一句话；做法要点放进步骤。不展示耗时和难度，列表只显示标签，详情显示辣度和标签。
- 食材编码 `主|名 用量;名 用量@辅|...@调|...`，步骤用 `@` 分隔。
- 颜色只用 `src/app/globals.css` 的 token：paper / ink / line / chili / brine / leaf / caramel。
- 标题用 `font-display`，正文 `font-sans`，不引入 webfont。
- 图标只用 `@phosphor-icons/react`，映射集中在 `src/lib/icons.tsx`；不混第二套图标库，不用汉字代替图标。
- 配图（文件名 = 菜品数字 id）：`python3 scripts/gen-dish-images.py --sub pork` 生成（默认 1k）；单道用 `--ids 90`；生成前要在 `scripts/dish_prompts.json` 里按 id 加提示词 → `./scripts/optimize-images.sh` 压成 webp → `node scripts/build-image-manifest.mjs` 刷新清单。没图的菜自动回落到分类图标。
- 可点击卡片用 `div role="button"`，内部才能嵌 `AddButton`；`<button>` 套 `<button>` 会触发 hydration 错误。
- 提交信息用 `feat:` / `fix:` / `chore:` 前缀，正文中文。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
