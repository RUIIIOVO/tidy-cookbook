<div align="center">

# 🍳 今天吃什么 (Tidy Cookbook)

**移动端优先的极简家常菜谱 · 抽菜灵感 · 智能合并买菜清单 · 全员多端实时同步**

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers_%26_D1_%26_DO-F38020?style=flat-square&logo=cloudflare)](https://workers.cloudflare.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)

[English](./README_EN.md) | **简体中文**

</div>

---

## 📱 视觉预览 (Screenshots)

| 1. 抽菜灵感 | 2. 菜谱浏览 | 3. 做法详情 | 4. 买菜清单 | 5. 历史归档 |
| :---: | :---: | :---: | :---: | :---: |
| <img src="./docs/screenshots/01-draw.png" width="180" /> | <img src="./docs/screenshots/02-menu.png" width="180" /> | <img src="./docs/screenshots/03-detail.png" width="180" /> | <img src="./docs/screenshots/04-cart.png" width="180" /> | <img src="./docs/screenshots/05-history.png" width="180" /> |
| 纠结吃啥？滑卡随心抽 | 93 道家常菜，拼音速搜 | 大图、分级食材与关键步骤 | 跨菜品同名食材智能合并 | 时间段筛选与下滑懒加载 |

---

## 💡 为什么做这个项目 (Why Tidy Cookbook)

市面上的主流美食与菜谱类 App 充斥着卖课买课、电商带货、冗长短视频与商业广告。做饭本来是一件纯粹、治愈的日常琐事，不应被算法和推荐流绑架。

**Tidy Cookbook** 只专注解决每天做饭决策的四个核心步骤：

1. **今天吃什么？** —— 拿不定主意时，按荤/素/海鲜/轻食等分类随心抽一道，不合心意左右滑换一道，抽中直接加入点菜单。
2. **快速挑菜** —— 收录精选家常菜，支持**菜名 / 全拼 / 首字母 / 食材**极速拼音搜索（如输入 `xcr` 秒出小炒肉）。
3. **点这一餐** —— 全家人或情侣可以通过各自手机协同点菜，增减份数、左滑删除、锁单确认，全端状态毫秒级实时同步。
4. **智能买菜清单** —— 自动将整餐所有菜品的食材提取并按同名食材智能合并累加，按份数倍乘（如：`五花肉 300g`、`姜 4片`），买菜时打勾状态全员实时同步，还可一键复制文本发送到微信。

---

## ✨ 核心特性 (Key Features)

- 🎲 **抽菜灵感**：卡片式触感翻动，支持荤、海鲜、素菜、减脂轻食、主食单向筛选，内置最近历史去重算法，避免连续抽中重复菜品。
- 📖 **双联交互菜单**：左侧竖向分类导航栏，支持点击瞬间直达与滚动联动监听；图片采用动态优先级调度器（Priority Scheduler），大跨度跳转不浪费带宽。
- ⚡ **原生级 SPA 视口保活（Keep-Alive）**：底栏 Tab 切换采用单页多视图保活架构，消灭传统路由反复销毁与 DOM 重建带来的卡顿，内存保留每个 Tab 独立的滚动位置，切换响应速度 `< 16ms`。
- 🔄 **全端实时协同（Real-time Sync）**：基于 Cloudflare Durable Objects 与 WebSocket，支持点菜单与买菜清单勾选状态的全员实时双向广播。
- 📦 **离线优先设计（Offline-First）**：无网状态下依然可加菜、勾选清单；网络恢复后自动进行 Outbox 队列回放与快照对齐。
- 🛒 **智能食材合并**：独创跨菜品食材解析合并引擎，同名同单位食材自动数值倍乘累加，支持调料一键折叠展开。
- 📋 **小票账单式历史**：支持按 `全部`、`近 7 天`、`近 1 个月`、`近 3 个月` 筛选；向下滚动自动流式分页懒加载；支持每日凌晨 4:00 自动定时归档并重置点菜单。
- 🎨 **纸墨极简设计系统**：严格遵守自定义调色板（`paper`、`ink`、`chili`、`brine`、`leaf`、`caramel`），移动端安全区深度适配，内嵌物理震动触感（Haptic Feedback）。

---

## 🛠️ 技术架构 (Tech Stack)

```
┌────────────────────────────────────────────────────────┐
│               前端展示层 (Next.js 16 静态导出)             │
│  React 19 · Tailwind CSS v4 · Framer Motion · Vaul    │
└───────────────────────────┬────────────────────────────┘
                            │ (静态资源免费托管 / 不计 Worker 额度)
┌───────────────────────────▼────────────────────────────┐
│         边缘服务层 (Cloudflare Workers & Assets)        │
│  - /api/*  路由代理与会话认证 (PBKDF2-SHA256 Token)       │
│  - 定时调度器 (Cron Trigger: 每日北京时间 04:00 自动归档)   │
└─────────────┬────────────────────────────┬─────────────┘
              │ WebSocket 双向同步          │ 结构化持久化
┌─────────────▼───────────────┐ ┌──────────▼─────────────┐
│  Durable Objects (KitchenDO)│ │   Cloudflare D1 (SQL)   │
│  - 厨房实时快照状态机        │ │  - user / session     │
│  - 全员 WebSocket 广播通道  │ │  - cart_item / state  │
│  - 下单 Bark 推送看守       │ │  - meal / meal_item   │
└─────────────────────────────┘ └─────────────────────────┘
```

- **前端架构**：Next.js 16 (App Router) + React 19 + TypeScript + Zustand。采用 `output: "export"` 纯静态导出，由 Workers Assets 提供边缘零成本托管。
- **持久化存储**：Cloudflare D1（基于 SQLite 的边缘分布式数据库）。
- **实时同步**：Cloudflare Durable Objects（启用 Hibernation API，休眠时不消耗计费时长；平台层自应答 Ping/Pong 心跳）。
- **会话持久化**：支持 Cookie 与 `localStorage` 令牌双重容灾，免登状态缓存 90 天，配合服务端自动滑动续期。
- **通知机制**：锁单确认后通过 Bark API 实时推送订单摘要至手机设备。

---

## 🚀 快速上手 (Quick Start)

### 1. 环境准备
本项目采用 `pnpm` 作为包管理器，要求 Node.js >= 18：

```bash
git clone https://github.com/RUIIIOVO/tidy-cookbook.git
cd tidy-cookbook
pnpm install
```

### 2. 本地开发

```bash
pnpm dev
```
浏览器打开 `http://localhost:3000` 即可开始预览。

### 3. 构建与检查命令

```bash
pnpm build            # 优化配图 + 重建清单 + 编译静态站点 (产出 ./out)
pnpm lint             # ESLint 语法与规范检查
pnpm cf:typecheck     # Cloudflare Worker 后端代码类型检查
pnpm preview          # 在本地 Miniflare / Workers 完整运行时环境中模拟运行
```

---

## 🌐 私有化部署指南 (Cloudflare Deployment)

本项目专为 Cloudflare 免费配额优化设计，全套基础设施可在免费额度内终身免费运行。

### 步骤一：配置 Wrangler

复制配置文件模版：
```bash
cp wrangler.example.jsonc wrangler.jsonc
```

登录 Cloudflare 账号：
```bash
pnpm exec wrangler login
```

### 步骤二：初始化 D1 数据库

1. 创建 D1 数据库：
   ```bash
   pnpm exec wrangler d1 create tidy-cookbook
   ```
   记录命令输出的 `database_id`，将其填入 `wrangler.jsonc` 对应字段。

2. 执行数据表初始化迁移：
   ```bash
   pnpm exec wrangler d1 execute tidy-cookbook --remote --file=./schema.sql
   pnpm exec wrangler d1 migrations apply tidy-cookbook --remote
   ```

3. 生成初始管理员账号（owner 权限）：
   ```bash
   node scripts/seed-users.mjs 你的用户名:你的密码:owner > /tmp/seed.sql
   pnpm exec wrangler d1 execute tidy-cookbook --remote --file=/tmp/seed.sql && rm /tmp/seed.sql
   ```

### 步骤三：绑定 Bark 通知推送密钥（可选）

如需在锁单时接收 Bark 推送通知：
```bash
pnpm exec wrangler secret put BARK_URL
# 输入形如：https://api.day.app/YOUR_KEY/
```

### 步骤四：一键部署

```bash
pnpm build
pnpm deploy
```

> **关于大陆访问优化**：Cloudflare 默认的 `*.workers.dev` 域名在部分地区可能存在 SNI 阻断。建议在 Cloudflare 仪表盘绑定自己的自定义域名（如 `cook.yourdomain.com`），享受国内高速直连。

---

## 🍳 增改菜谱规范 (Custom Dishes)

项目中所有菜谱均以紧凑编码集中收录于 `src/data/raw.ts`。

### 编码格式规范：
```ts
[94, "菜品名称", "一句话口感描述（吃起来什么样，禁止口号）", "小类分类", 辣度(0-3), ["标签1", "标签2"],
  "主|主料 份量@辅|辅料 份量@调|调料 份量",
  "第一步做法@第二步做法@第三步做法@第四步做法"],
```

- **菜品 ID**：每行开头的手写递增正整数，一经使用**永不修改、不复用、不重排**（数据库历史订单与配图文件名均绑定此编号）。
- **更新索引**：每当修改或添加菜品后，只需执行：
  ```bash
  node scripts/build-pinyin.mjs
  ```
  脚本会自动重新生成无字典依赖的拼音首字母索引。
- **自动配图管线**：在 `scripts/dish_prompts.json` 中添加英文提示词，运行：
  ```bash
  python3 scripts/gen-dish-images.py --ids 94
  ./scripts/optimize-images.sh
  node scripts/build-image-manifest.mjs
  ```
  自动生成统一质感的餐盘摄影级配图并优化为 800px WebP 格式。

---

## 📄 开源许可证 (License)

本项目基于 [MIT License](./LICENSE) 协议开源。
