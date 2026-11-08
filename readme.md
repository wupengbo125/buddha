# 念佛器（buddha）

手机念佛计数网页。可无限添加佛号计数器，点按即时计数，每累计到 5 的倍数把增量同步到远端；每日零点当日声数归零、累计总数永久保留。点按在屏幕中上部分弹出字幕，字幕淡出时长可调；每个计数器详情页可自由增删图片。

技术栈照搬 ebbiii：Next.js 14 App Router + OpenNext Cloudflare + D1（计数库）+ R2（图片）+ TypeScript + Tailwind。无登录、单设备（按浏览器 `localStorage` 里的设备 id 隔离数据）。

## 上线地址

- **https://buddha.wupengbo125.workers.dev**

## 功能

- 首页无限增删佛号计数器；每张卡片显示名称 / 当日声数 / 累计总数 / 大点按区（移动端优先）。
- 点按即时本地 +1（离线可用，`localStorage` 主存）；累计到 5 的倍数推一次远端，不足 5 的尾数由兜底定时器 / 离开页面 / 下次进入页面补推。每批尾数带随机 `event_id`，服务端按 `UNIQUE(counter_id, device_id, event_id)` 幂等去重，重试沿用同一 id，不丢不重；本地 state 丢失时以 `GET /api/counters` 的服务端 `total/today` 为基准对账恢复。
- 尾数按日期分组：零点前的尾数记入旧日期、零点后的记入新日期，服务端按各自 `date` 归零；每日零点（时区可配，默认 `Asia/Shanghai`）当日归零、总数不变。
- 字幕：点按弹出（文案取计数器字幕，为空则取佛号名），到设定时长淡出；连续点击重置计时；时长全局可设、每个计数器可覆盖。
- 详情页：改名 / 改字幕 / 改字幕时长 / 图片墙（多图上传、删除、回显，图片存 R2）。

### 图片回显的 device_id 取舍

`<img src>` 无法带 `X-Device-Id` 请求头。为满足「所有接口校验 device_id / 跨设备 404」，图片回显接口 `GET /api/img/[...key]` 允许用 `?device_id=` 查询参数（图片 url 生成时自动带上），并校验该 key 在 `images` 表中存在且记录 `device_id` 与 query 一致，否则 404；query 缺失 / 非法返回 400。带 `X-Device-Id` 头的请求与 `?device_id=` 二者取其一即可，不要求同时。其余接口仍用头（或 body / query）传 device_id。

## 本地开发

```bash
pnpm install
pnpm dev            # http://127.0.0.1:3000
```

本地 `next dev` 没有 Cloudflare 绑定时，`lib/runtime.ts` 会退化为 `node:sqlite` 内存 D1 与内存 R2（进程内有效，重启清空）。要走真实绑定：

```bash
pnpm run db:migrate:local                    # 本地 D1 建表
pnpm run preview                             # opennextjs-cloudflare build + preview
```

## 校验

```bash
pnpm typecheck       # tsc --noEmit
pnpm test            # vitest run，纯逻辑单测，不依赖 Cloudflare 上下文
```

## 部署

两种方式：

1. **自动**：`git push` 到 `main` 触发 `.github/workflows/deploy.yml` → 应用 D1 迁移 → `opennextjs-cloudflare build` + `deploy`。需在仓库 Secrets 配置 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。
2. **手动**：`pnpm run deploy`（等价于 build + deploy）；远端建表用 `pnpm run db:migrate:remote`。

## 如何改域名 / 品牌

集中收口在两处，业务组件不硬编码品牌词：

1. **域名**：改 `wrangler.toml` 第 1 行 `name`（决定 `*.workers.dev` 子域名，也决定 Worker 名）；同时改 `lib/brand.ts` 里的 `siteUrl`。改这两处即可换域名，跟 jide 一样。
2. **展示名 / 标语 / localStorage 前缀**：改 `lib/brand.ts` 的 `siteName`、`siteSubtitle`、`domainNote`、`storageNamespace`。`lib/device.ts` / `lib/settings.ts` / `lib/storage.ts` 的 localStorage key 前缀都由 `storageNamespace` 派生，业务文件不硬编码品牌词。

> 若使用自定义域名，还需要在 Cloudflare 控制台为 Worker 绑定 route / custom domain，并把 `siteUrl` 改成该域名。

## 环境事实

- Cloudflare 账号 `b53f4ee34513a36097e7c496d8a732ef`，workers.dev 子域 `wupengbo125`。
- D1：`buddha`（binding `DB`，id `5a1e78c9-990e-44ae-903c-3f26c03288c7`）。
- R2：`buddha-images`（binding `IMAGES`）。
- GitHub 远端：`https://github.com/wupengbo125/buddha.git`（private，main 分支）。

## 目录速览

- `lib/brand.ts` 品牌 / 域名 / localStorage 前缀集中配置
- `lib/counter-store.ts` 客户端计数纯逻辑（推送判定 / 按日期 pending / event_id 幂等 / 跨零点）
- `lib/taps.ts` 服务端累加与 event_id 幂等账本（纯逻辑）
- `lib/storage.ts` 本地状态持久化与服务端对账恢复
- `lib/image-access.ts` 图片回显 device_id 校验与 url 生成
- `migrations/0001_init.sql` 建表（DDL 单一来源；`lib/local.ts` 本地兜底运行时直接读它）
- `lib/time.ts` 时区日期键
- `lib/runtime.ts` D1 / R2 绑定获取
- `migrations/0001_init.sql` 建表
- `app/api/**` 计数器 CRUD / 计数上报 / 图片 / 图片回显
- `components/**` 首页、卡片、字幕、设置、详情页
- `__tests__/**` vitest 单测
