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
2. **翻菜单** — 76 道家常菜，图文列表，拼音首字母搜索（`xcr` → 小炒肉）
3. **点这一餐** — 加减份数、批量删除、锁单确认
4. **买菜清单** — 把这一餐所有食材跨菜品合并、按份数倍乘，一键复制发微信

没有账号、没有广告、没有后端依赖。数据在本地，菜谱在代码里。

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
| 状态 | Zustand + persist（localStorage） |
| 部署 | Cloudflare Workers + OpenNext（历史订单用 D1，规划中） |

菜品数据是**构建期静态模块**，不查库、可全文搜索、可被边缘缓存。点菜单存 localStorage，只有历史订单才需要 D1。

## Quick Start

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

其他命令：

```bash
pnpm build                       # 生产构建
pnpm lint                        # ESLint
node scripts/build-pinyin.mjs    # 改了菜品数据后重新生成拼音索引
```

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
