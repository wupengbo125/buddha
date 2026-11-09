# 念佛器（buddha）

个人用敲木鱼 / 念佛计数网页。**登录后才能使用，未登录一律显示登录页**；单账号一份数据，手机、电脑登同一账号看到同一份计数。点按即时计数、**每点一次即上报一次**（服务端原子累加，计数以服务端为唯一权威）；每日零点当日声数归零、累计总数永久保留。点按有 Web Audio 合成的短木鱼声，每个佛号可单独开关音效、设置页可一键全关。

技术栈照搬 ebbiii：Next.js 14 App Router + OpenNext Cloudflare + D1（计数库）+ R2（图片）+ TypeScript + Tailwind。

## 上线地址

- **https://buddha.wupengbo125.workers.dev**

## 登录

- 账号：`18592012523`（常量，写在 `lib/auth.ts`，无注册 / 多用户）。
- 密码：来自环境变量 **`common_password`**。生产由 Cloudflare Worker secret 提供（`lib/session.ts` 经 `getCloudflareContext().env.common_password` 读取），本地 `next dev` / 测试回退 `process.env.common_password`。
- 密码**不进仓库、不进日志、不进客户端 bundle**：CI 每次部署用仓库 Secret `COMMON_PASSWORD` 执行 `wrangler secret put common_password` 幂等注入；本地把 `.env.example` 复制为 `.env.local` 自行填值。
- session：jose `SignJWT` HS256，cookie `buddha_session`（`httpOnly` + `secure`(https) + `sameSite=lax`，30 天）；签名密钥由 `common_password` 做 SHA-256 派生，不引入第二个 secret。
- `middleware.ts` 守门：未登录访问任何页面 302 到 `/login`，访问数据 API 401；已登录访问 `/login` 302 回 `/`。受保护页面另有 `lib/guard.ts` 服务端二次校验。

## 四个页面（各只干一件事）

| 路由 | 职责 |
|---|---|
| `/login` | 登录表单，无导航、无计数数据 |
| `/` 念佛页 | 佛号主视觉 + 大木鱼点按 + 当日/总数 + 中上字幕；无添加框、无设置面板 |
| `/counters` 添加页 | 佛号列表 + 添加 / 改名 / 删除 + 字幕文案编辑 + 每项目音效开关 + 进入图片管理；不计数 |
| `/counter/[id]` 详情 | 该佛号的图片（上传/删除/回显）、单计数器字幕时长、独立音效开关 |
| `/settings` 设置页 | 点击音效全局总开关、字幕淡出时长、时区、外观、域名说明、退出登录；不管佛号 |

五个受保护页面共用一套导航（移动端底部 / 桌面顶部：念佛 / 添加 / 设置），登录页无导航。念佛页视觉取 `one-awesome-design/reference/apple-design.md` 的原则（极低密度、大留白、UI 退让、单一强调色、字阶克制、44px 触控、`scale(0.95)` 按压、8px 间距），换成禅意配色：宣纸底 `#f6f4ec`、墨色字 `#3a3327`、檀木/赭石 `#8a5a3b` 为唯一强调色、细发丝线、金色极少量点缀，无 Apple 蓝、无渐变背景、无卡片投影。

## 深色模式 / 添加到主屏幕（PWA）

- 颜色全走 CSS 变量（浅/深两套）+ `color-scheme`，默认跟随系统；设置页「外观」可手动切「跟随系统 / 浅色 / 深色」，存 `localStorage`，启动时内联脚本在 hydrate 前设好 `data-theme`，刷新不白闪。
- 手动浅/深色不依赖 `prefers-color-scheme`，iOS 主屏幕 Web App（standalone）里也生效；`viewport.themeColor` 输出深浅两个 `<meta name="theme-color">`，状态栏 / 启动画面配色随深浅走。
- iPhone：Safari 打开 → 分享 →「添加到主屏幕」即以 standalone 启动，图标取 `app/icon.png` / `app/apple-icon.png`，配置由 `app/manifest.ts` 生成的 `/manifest.webmanifest` 提供。

## 计数与音效（v6）

- **每次上传**：点按立即本地乐观 +1 刷新显示，并立即 `POST /api/counters/[id]/taps` 一次（`delta=1`、该次点击新生成的 `event_id`、`date`）。服务端用单条原子 `UPDATE` 累加 `total/today`，并发快速点击不丢数。
- **幂等只防重试**：`UNIQUE(counter_id, device_id, event_id)` 保留，`device_id` 固定 `OWNER_ID`。失败请求进内存重试队列，沿用同一 `event_id` 重发（`INSERT OR IGNORE` 判重，不重复累加）；重试时机为下次点击 / 页面回前台 / 短退避定时器。不再有攒 5 次、pending 批次、按日期分批、localStorage 对账、30s/beforeunload 兜底整套状态机。
- **跨零点**：服务端按请求 `date` 处理，`today_date` 与本次 `date` 不同则当日归零（`today=1`）、总数不变；前端零点轻量重拉列表刷新显示，以服务端响应为准。
- **每项目独立音效**：`counters.sound_enabled`（迁移 `migrations/0002_add_sound.sql` 新增，默认 1）存 D1、跟账号走、跨设备一致；详情页与添加页可切换，走 `PATCH /api/counters/[id]`。
- **全局总开关**：设置页「点击音效」总开关（存 localStorage）一键全关；关掉时任何佛号都不响。两级判定：总开关 off → 全静音；总开关 on → 看各佛号自己的 `sound_enabled`。
- **音效与震动**：`lib/sound.ts` 用 Web Audio 合成约 110ms 短木鱼声（无资源文件，首次用户手势内创建/恢复 `AudioContext`）；Android 用 `navigator.vibrate` 短脉冲渐进增强、iOS 静默不报错；`prefers-reduced-motion` 下抑制视觉涟漪与震动（不影响音效）。任何音效异常都静默、不阻塞计数。
- **字幕**：点按弹出（文案取计数器字幕，为空则取佛号名），到设定时长淡出；连续点击重置计时；时长全局可设、每个计数器可覆盖。
- 去掉按浏览器 `device_id` 隔离：所有 `SELECT/INSERT/UPDATE/DELETE` 不再按 device_id 过滤，写入时统一填固定常量 `OWNER_ID = 'owner'`，单账号一份数据。
- 图片存 R2；回显接口 `GET /api/img/[...key]` 验 session cookie（`<img src>` 自动携带）并校验 key 存在于 `images` 表，否则 404，URL 不再带 device_id。

## 本地开发

```bash
pnpm install
cp .env.example .env.local   # 填入 common_password
pnpm dev                     # http://127.0.0.1:3000
```

本地 `next dev` 没有 Cloudflare 绑定时，`lib/runtime.ts` 会退化为 `node:sqlite` 内存 D1 与内存 R2（进程内有效，重启清空）。要走真实绑定：

```bash
pnpm run db:migrate:local                    # 本地 D1 建表
pnpm run preview                             # opennextjs-cloudflare build + preview
```

数据库迁移按文件名顺序应用：`migrations/0001_init.sql` 已应用到远端、**禁止改动已应用的迁移**；新增列走 `migrations/0002_add_sound.sql`。`lib/local.ts` 的 `readSchemaSql()` 按序读取全部 `migrations/*.sql` 拼接，本地 dev / 单测内存 D1 自动带上新列。

## 校验

```bash
pnpm typecheck       # tsc --noEmit
pnpm test            # vitest run，纯逻辑单测，不依赖 Cloudflare 上下文
pnpm build           # next build
```

## 部署

两种方式：

1. **自动**：`git push` 到 `main` 触发 `.github/workflows/deploy.yml` → 应用 D1 迁移 → 用 `${{ secrets.COMMON_PASSWORD }}` 注入 `wrangler secret put common_password` → `opennextjs-cloudflare build` + `deploy`。需在仓库 Secrets 配置 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`COMMON_PASSWORD`。
2. **手动**：`pnpm run deploy`（等价于 build + deploy）；远端建表用 `pnpm run db:migrate:remote`，secret 用 `wrangler secret put common_password` 单独设置。

## 如何改域名 / 品牌

集中收口在两处，业务组件不硬编码品牌词：

1. **域名**：改 `wrangler.toml` 第 1 行 `name`（决定 `*.workers.dev` 子域名，也决定 Worker 名）；同时改 `lib/brand.ts` 里的 `siteUrl`。改这两处即可换域名。
2. **展示名 / 标语 / localStorage 前缀**：改 `lib/brand.ts` 的 `siteName`、`siteSubtitle`、`domainNote`、`storageNamespace`。`lib/settings.ts` 的 localStorage key 前缀由 `storageNamespace` 派生。

> 若使用自定义域名，还需在 Cloudflare 控制台为 Worker 绑定 route / custom domain，并把 `siteUrl` 改成该域名。

## 环境事实

- Cloudflare 账号 `b53f4ee34513a36097e7c496d8a732ef`，workers.dev 子域 `wupengbo125`。
- D1：`buddha`（binding `DB`，id `5a1e78c9-990e-44ae-903c-3f26c03288c7`）。
- R2：`buddha-images`（binding `IMAGES`）。
- GitHub 远端：`https://github.com/wupengbo125/buddha.git`（private，main 分支）。

## 目录速览

- `lib/brand.ts` 品牌 / 域名 / localStorage 前缀集中配置
- `lib/auth.ts` 鉴权纯逻辑（常量时间比较、SHA-256 派生、jose session 签发/校验）
- `lib/session.ts` 读密码 / 读写 cookie / `requireSession`
- `lib/guard.ts` 页面服务端登录守卫；`middleware.ts` 全局守门
- `lib/api.ts` 前端请求封装（`credentials` + 401 跳登录 + 每次上报固定 delta=1）
- `lib/http.ts` `jsonError` / `readJson` / `requireSession`
- `lib/counter-store.ts` 客户端计数显示纯逻辑（乐观 +1 / 每次点击独立 event_id / 服务端响应校正）
- `lib/storage.ts` 上报失败请求的内存重试队列（沿用同一 event_id 幂等重发）
- `lib/taps.ts` 服务端原子累加的纯逻辑镜像 + event_id 幂等账本（单测用）
- `lib/sound.ts` 两级音效开关判定 / Web Audio 木鱼声 / 震动渐进增强
- `lib/settings.ts` 字幕时长 / 时区 / 点击音效全局总开关 / 覆盖
- `lib/r2.ts` / `lib/image-access.ts` R2 key 与回显 URL 生成
- `lib/time.ts` 时区日期键
- `lib/runtime.ts` D1 / R2 绑定 + 密码读取
- `migrations/0001_init.sql` 建表；`migrations/0002_add_sound.sql` 新增每项目音效列（`lib/local.ts` 按序读全部迁移供本地兜底）
- `app/api/auth/**` 登录 / 登出 / me；`app/api/**` 计数器 CRUD / 计数原子累加上报 / 图片 / 图片回显
- `components/**` 导航、木鱼、念佛逻辑 hook、四页客户端、字幕、登录表单、图片管理
- `__tests__/**` vitest 单测
