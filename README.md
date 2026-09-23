# Tidy Cookbook

> A clean, mobile-first home cooking app. Browse the menu, roll the dice when you can't decide, build tonight's order, and get an auto-merged grocery list.
>
> 简洁的家常菜谱 H5。翻菜单、拿不定主意就抽一道、点好这一餐、自动合并出买菜清单。

<!-- 截图位：docs/screenshots/{home,menu,detail,cart}.png -->

| 抽菜 | 菜单 | 详情 | 点菜单 |
| :--: | :--: | :--: | :----: |
|  —   |  —   |  —   |   —    |

## Why

市面上的菜谱 App 都在卖课、推广告、塞短视频。这个项目只解决四件事：

1. **今天吃什么** — 按分类随机抽一道，不合意就换，抽中直接进点菜单
2. **翻菜单** — 75 道家常菜，图文列表，拼音首字母搜索（`xcr` → 小炒肉）
3. **点这一餐** — 加减份数、批量删除、锁单确认
4. **买菜清单** — 把这一餐所有食材跨菜品合并、按份数倍乘，一键复制发微信

没有广告、没有推荐算法、没有短视频。菜谱在代码里，点菜单在你自己的 Cloudflare 账号里。

## Features

- 🎲 **抽菜** — 可按荤 / 海鲜 / 素 / 主食筛选，避免连续重复
- 📖 **菜单** — 4 大类 13 小类，左侧竖向导航 + 滚动联动高亮
- 🔍 **搜索** — 菜名 / 全拼 / 首字母 / 食材，构建期预生成拼音，不打字典进包
- 📋 **详情** — 食材按主料/辅料/调料分组带用量，做法分步
- 🛒 **点菜单** — 分类分组、批量管理、锁单 / 取消锁单
- 🧺 **买菜清单** — 同名食材自动合并（`姜 3片 + 1块`），可逐条打勾，一键复制
- 📱 **移动端优先** — 安全区适配、触感反馈、PWA 可加到主屏

## Tech Stack

| 层 | 选择 |
| --- | --- |
| 框架 | Next.js 16 (App Router) + React 19 |
| 样式 | Tailwind CSS v4，纸墨主题，无 webfont |
| 图标 | [Phosphor Icons](https://phosphoricons.com) |
| 动效 | motion (Framer Motion) |
| 抽屉 / Toast | vaul · sonner |
| 状态 | Zustand + persist（localStorage 作离线缓存） |
| 同步 | Durable Object + WebSocket，多设备实时同步 |
| 存储 | Cloudflare D1（账号 / 点菜单 / 历史订单） |
| 部署 | Next.js `output: 'export'` + Cloudflare Workers Assets |

菜品数据是**构建期静态模块**，不查库、可全文搜索、可被边缘缓存。整站静态导出后由 Workers Assets 托管——静态资源请求免费且不计入 Workers 配额，只有 `/api/*` 才会唤醒 Worker。

点菜单**离线优先**：本地先改，操作进 outbox，WebSocket 发出后转 inflight，收到服务端快照才确认。断网照常加菜，重连自动回放。

## Quick Start

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

其他命令：

```bash
pnpm build                       # 压图 + 生产构建（产出 ./out）
pnpm lint                        # ESLint
pnpm cf:typecheck                # worker/ 的类型检查（Next 的 tsconfig 不覆盖它）
pnpm preview                     # 在本地 Workers 运行时里跑
pnpm deploy                      # 构建并部署到 Cloudflare
node scripts/build-pinyin.mjs    # 改了菜品数据后重新生成拼音索引
```

## 部署到自己的 Cloudflare

```bash
cp wrangler.example.jsonc wrangler.jsonc
pnpm exec wrangler login
pnpm exec wrangler d1 create tidy-cookbook        # 把 database_id 填进 wrangler.jsonc
pnpm exec wrangler d1 execute tidy-cookbook --remote --file=./schema.sql

# 生成账号（密码自己定）。owner 能清空点菜单和删历史，guest 只能点菜
node scripts/seed-users.mjs 你的用户名:你的密码:owner > /tmp/seed.sql
pnpm exec wrangler d1 execute tidy-cookbook --remote --file=/tmp/seed.sql && rm /tmp/seed.sql

pnpm deploy
```

密码用 PBKDF2-SHA256 / 10 万轮 / 每人独立 salt，明文不出本机。

Fork 之后要改 `wrangler.jsonc` 里的三处：`name`、`d1_databases[0].database_id`、
`routes[0].pattern`。里面没有凭据——`database_id` 只是资源标识，没有 API token
用不了；真正的凭据在 `~/.wrangler`，从不入库。

> **中国大陆访问**：`*.workers.dev` 被 SNI 定向封锁，实测 DNS 会被投毒到无关地址。
> 绑一个自有域名走 `custom_domain` 即可直连，证书由 Cloudflare 自动签发并续期。

### 自动部署

`.github/workflows/deploy.yml` 在推到 `main` 时跑 lint → worker 类型检查 → 构建 →
部署，任一步失败就不会发布。需要在仓库 Settings → Secrets 里配两个值：

| Secret | 来源 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens)，用 **Edit Cloudflare Workers** 模板 |
| `CLOUDFLARE_ACCOUNT_ID` | `pnpm exec wrangler whoami` 输出里的 Account ID |

## 加自己的菜

只改 `src/data/raw.ts`，一道菜一行紧凑编码：

```ts
["湘味辣椒小炒肉", "螺丝椒配五花肉猛火爆香，下饭第一名", "pork", 2, 20, 1, ["下饭", "快手"],
  "主|五花肉 300g;螺丝椒 5根@辅|蒜 4瓣;姜 3片@调|生抽 1勺;盐 适量",
  "五花肉切薄片@热锅不放油，先下肥肉煸出油@...大火快炒至虎皮起皱"],
```

字段依次是：`名称, 一句话描述, 小类, 辣度0-3, 分钟, 难度1-3, 标签[], 食材, 步骤`。
食材用 `主|辅|调` 分组、`;` 分隔，步骤用 `@` 分隔。

写完跑一次：

```bash
node scripts/build-pinyin.mjs
```

拼音、首字母、URL id 会自动生成到 `src/data/pinyin.generated.json`，不要手改。

## Roadmap

- [ ] 76 张统一风格配图（`scripts/gen_image.py`，走 Gemini 免费额度）
- [ ] 历史订单接 Cloudflare D1 + OpenNext 部署
- [ ] 首页「一键配一桌」（2 荤 1 素 1 汤等搭配规则）
- [ ] 转盘皮肤

## License

MIT
