# tidy-cookbook · 家常菜谱 H5

移动端优先的自用菜谱 / 点菜应用。76 道菜，静态数据 + localStorage，历史订单后续接 Cloudflare D1。

## 命令

```bash
pnpm dev -p 3210        # 本地开发
pnpm build              # 生产构建
pnpm lint               # ESLint（react-hooks/purity 会管得很严）
node scripts/build-pinyin.mjs   # 改了 src/data/raw.ts 之后必须重跑
```

## 目录

```
src/data/raw.ts                 菜品源数据（手写，紧凑编码）
src/data/pinyin.generated.json  构建期生成的拼音/首字母/id，勿手改
src/data/dishes.ts              解析后的 Dish[] / sections / 分类
src/lib/{search,store,ui-store,theme,utils}.ts
src/components/                 DishCard / DishSheet / TabBar / MenuView ...
src/app/(tabs)/                 四个 tab：/ · /menu · /cart · /history
scripts/gen_image.py            cliproxyapi gemini-3.1-flash-image 生图（免费额度，有 5h 冷却）
```

## 约定

- **加菜品**：只改 `src/data/raw.ts`，然后 `node scripts/build-pinyin.mjs`。不要手写 id 或拼音。
- **食材编码**：`主|名 用量;名 用量@辅|...@调|...`，步骤用 `@` 分隔。
- **配色**：只用 `globals.css` 里的 token（paper / ink / line / chili / brine / leaf / caramel）。不要引入金色、不要紫色渐变。
- **字体**：标题走 `font-display`（系统中文衬线），正文 `font-sans`（PingFang）。不加 webfont。
- **图标**：统一用 [Phosphor Icons](https://phosphoricons.com)（`@phosphor-icons/react`），映射集中在 `src/lib/icons.tsx`（`catIcon` / `subIcon` / `tabIcon` / `metaIcon`）。不要再用汉字当图标，也不要混用第二套图标库。
- **配图**：还没生成。`src/components/dish-thumb.tsx` 里 `IMAGES_READY = false` 时渲染印章占位；图片就位后改成 `true`，文件放 `public/images/dishes/<id>.webp`。
- **嵌套按钮**：卡片外层必须是 `div role="button"`，里面才能放 `AddButton`，否则 hydration 报错。

## 待做

- P2：76 张配图（gemini-3.1-flash-image，注意 429 后冷却 5 小时）
- P7：历史订单接 D1 + `@opennextjs/cloudflare` 部署
- P8：首页「一键配一桌」（2荤1素1汤等搭配规则）

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
