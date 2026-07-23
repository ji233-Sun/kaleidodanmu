# 前后端缺口分析

> 基于 `types/` 下的 API 契约（Zod schema + DTO）、`app/api/` 已实现的路由、以及前端现有页面（`app/`、`lib/profile.ts`、`lib/square.ts` 中的 mock 注释）整理。
> 生成时间：2026-07-23
>
> **实施进展（2026-07-23）**：第一节「前端缺少的页面」已全部落地——`/login`、`/register` + 头部真实登录态（`lib/session.ts`）、`/settings`（API Token + 应用设置两个页签）、`/square/[id]` 详情页（暂由 `lib/profile.ts` mock 承载）、Studio 云端版本/发布面板（`components/studio/cloud-panel.tsx`，保留 localStorage 编辑流）。
> 修复了一个阻塞性服务端 bug：TypeORM DataSource 在 Turbopack 多模块上下文下不是单例，导致全部 HTTP 接口 500；现改为 `getRepo()` 懒初始化 + 按表名取 Repository（见 `server/database/data-source.ts`）。

## 现状对照

### 后端已实现的接口（`app/api/`）

| 模块 | 接口 |
| --- | --- |
| auth | `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` |
| effects | `GET/POST /api/effects` · `GET/PATCH/DELETE /api/effects/:id` |
| versions | `GET/POST /api/effects/:id/versions` |
| draft | `GET/PUT /api/effects/:id/draft` |
| publish | `POST /api/effects/:id/publish` |
| settings | `GET /api/settings` · `GET/PUT /api/settings/:key` |
| tokens | `GET/POST /api/tokens` · `DELETE /api/tokens/:id` |

`types/` 中的契约（auth / effect / version / draft / settings / token）与上述路由基本一一对应。

### 前端已实现的页面（`app/`）

| 路径 | 说明 | 数据来源 |
| --- | --- | --- |
| `/` | 创作入口（一句话创建） | 纯前端 |
| `/login` `/register` | 登录 / 注册 | `/api/auth/*` ✅ |
| `/settings` | API Token 管理 + 应用设置 | `/api/tokens` `/api/settings` ✅ |
| `/studio` | 对话式创作 + 预览 + 云端版本/发布面板 | localStorage（`lib/store.ts`）+ Mock Agent；云端面板接 `/api/effects` `/draft` `/versions` `/publish` ✅ |
| `/mine` | 我的万花筒 | localStorage |
| `/square` | 万花筒广场 | Mock 数据（`lib/square.ts`） |
| `/square/[id]` | 广场作品详情 | Mock（`lib/profile.ts` 按真实 API 形态定义，接口就绪后替换） |
| `/u/[name]` | 个人主页 | Mock 数据（`lib/profile.ts`） |
| `/oauth/authorize` | OAuth 授权页 | `/api/oauth/authorize` ✅（Authorization Code + PKCE，CLI 本地回调） |

---

## 一、前端缺少的页面（2026-07-23 已全部落地）

### 1. 登录 / 注册页 ✅

- 已实现：`/login`、`/register`（共用 `components/auth/auth-form.tsx`），支持 `?next=` 回跳（仅限站内路径）；`components/site-header.tsx` 改为真实登录态（未登录显示登录/注册按钮，已登录显示邮箱 + 设置入口 + 退出），会话状态由 `lib/session.ts` 全局管理。
- 遗留：`AuthUserDto` 没有昵称字段，头部暂以邮箱展示；个人主页入口待契约对齐（见第三节）后再挂。

### 2. API Token 管理页 ✅

- 已实现：`/settings` 的「API Token」页签——创建（勾选 scopes、选有效期）、列表（有效/过期/吊销状态）、吊销；创建成功一次性展示明文 token + 复制。

### 3. 版本历史与发布管理 UI ✅

- 已实现：Studio 右侧「云端版本与发布」面板（`components/studio/cloud-panel.tsx`）。保留 localStorage 编辑流不动，登录后可：保存到云端（自动建 Effect + 存草稿快照）、同步草稿、上传新版本（配方打包为 manifest + ES Module）、版本列表展示与 draft/staging/published 渠道指针切换（即回滚）。本地作品经 `serverId` 字段关联云端 Effect。

### 4. 广场作品详情页 ✅（Mock 承载）

- 已实现：`/square/[id]`——大预览、作者卡片（链到 `/u/[name]`）、点赞/投币/收藏（乐观更新）、使用/二创、二创列表；广场与个人主页的作品卡片均已链入。
- 数据源仍是 `lib/profile.ts` 的 mock（`fetchSquareEffect` / `fetchDerivatives` / `postInteraction`），等第二节的互动/二创接口就绪后整体替换为 fetch。

### 5. 应用设置页 ✅

- 已实现：`/settings` 的「应用设置」页签——列出全部 key/value，行内编辑保存（`PUT /api/settings/:key`），页面注明为平台级配置。

---

## 二、后端缺少的接口

### 1. 广场列表接口

- `/square` 页目前使用 `lib/square.ts` 中硬编码的 `SQUARE_ITEMS`（文件头注释：「之后替换为服务端已发布 Effect 列表」）。
- 需要：`GET /api/square`（或 `GET /api/effects?channel=published&visibility=public`），返回已发布作品的卡片信息（名称、配方/封面、作者、点赞/使用/二创数、标签、创建时间）。
- 注意：`types/common.ts` 已定义 `Paginated<T>` 但尚无接口使用，广场列表应是第一个消费方；现有 `EffectListResponse` 不分页，需要区分「我的作品列表」和「广场公开列表」两种契约。

### 2. 用户公开资料接口

- `lib/profile.ts:64` 注释明确：`GET /api/users/:name —— 用户资料 + 发布的万花筒 + 聚合统计`。
- `/u/[name]` 页需要的字段：昵称、头像（或 avatarHue）、简介、注册时间、粉丝数、发布的作品列表、聚合统计（总点赞/投币/收藏/二创）。
- 需要：`GET /api/users/:name`。

### 3. 作品互动接口

- `lib/profile.ts:111` 注释明确：`POST /api/effects/:id/interactions —— 点赞 / 投币 / 收藏`。
- 需要：`POST /api/effects/:id/interactions`（kind: like/coin/favorite，on: boolean），以及详情页读取当前用户互动状态的方式（详情接口内联或单独 GET）。

### 4. 二创（derivatives）列表接口

- `lib/profile.ts:84` 注释明确：`GET /api/effects/:id/derivatives —— 某作品的二创列表（关联查看）`。
- 需要：`GET /api/effects/:id/derivatives`；同时作品模型需要记录 `forkedFrom` 关系（当前 `EffectDto` 没有该字段，前端 localStorage 模型里有）。

### 5. OAuth 授权流程接口（CLI 登录链路）✅ 已完成（2026-07-23）

- 已实现 Authorization Code + PKCE，CLI 回调为 `127.0.0.1` 本地服务器（`kdanmu login` / `whoami`）：
  - `POST /api/oauth/authorize` —— 已登录用户同意授权，签发一次性授权码（校验 client_id、loopback redirect_uri、scope 白名单、PKCE challenge；授权码只存哈希，5 分钟有效）。
  - `POST /api/oauth/token` —— 授权码 + code_verifier 交换 `kdt_` access token（重放、错误 verifier、redirect_uri 不匹配均拒绝）。
  - `/api/*` 支持 `Authorization: Bearer kdt_*`（`getCurrentUser` 在 cookie 之外回退查 API token）。
- 仍待做：Device Code 流程（无浏览器环境）、refresh token、第三方 client 注册。
- scope 目录前后端共用 `types/oauth.ts` 的 `SCOPE_CATALOG`（`profile:read` / `effects:read` / `effects:write` / `square:publish`）。

### 6. 弹幕 Mock 数据源接口（技术方案 §9 规划）

- 规划中的 `app/api/mock/vod`（点播 REST，`DmSegMobileReply` 风格）和 `app/api/mock/live`（直播 WebSocket 握手代理）均未实现。
- 目前预览弹幕由前端固定种子生成（`app/studio/page.tsx` 注释「接入后端后替换为真实弹幕流」）。

### 7. LLM 代理转发接口（技术方案 §9 规划）

- 规划中的 `app/api/llm/proxy`（转发 + 限流，不执行代码）未实现。
- 目前 `lib/agent.ts` 为纯前端 Mock Agent，不经过任何服务端。

---

## 三、契约层面的不一致（需要前后端对齐）

1. **用户模型缺昵称**：`AuthUserDto` 只有 `email`，没有 `name`/昵称字段；但前端广场、个人主页、二创全部以昵称作为用户标识（`/u/[name]`）。注册契约 `RegisterSchema` 也只有 email + password。需要确认：昵称是注册时填写还是系统自动生成，`/u/[name]` 的 `name` 对应哪个字段。
2. **作品模型缺社区字段**：`EffectDto` 没有 `forkedFrom`（二创来源）、`visibility/shared`（是否公开到广场）、互动计数等字段，无法支撑广场与个人主页。
3. **Effect id 类型**：契约中 `EffectDto.id` 为 `number`，前端 localStorage 模型与广场 mock 使用字符串 id（如 `sq-glass`），接入时需要统一。
4. **草稿归属**：`DraftDto.effectId` 可为 `null`（未关联作品的游离草稿），但路由只有 `/api/effects/:id/draft`，没有「创建游离草稿 / 草稿转正式作品」的入口，需确认该场景是否需要接口。

---

## 四、优先级建议

| 优先级 | 事项 |
| --- | --- |
| ~~P0~~ ✅ | 登录/注册页 + 前端会话接入（已完成） |
| P0 | 契约对齐：用户昵称、作品社区字段、id 类型 |
| P1 | 广场列表接口 + `/square` 接入真实数据 |
| P1 | Studio 全面接入 effects/draft（替换 localStorage 编辑流；云端面板式接入已完成 ✅） |
| ~~P2~~ ✅ | Token 管理页（已完成）；OAuth 授权码/token 接口 + CLI 登录（已完成，Device Code 待做） |
| P2 | 用户公开资料接口；作品详情页互动/二创接口（页面已用 mock 承载 ✅，待换真实数据源） |
| P3 | 弹幕 Mock 数据源、LLM 代理（应用设置页已完成 ✅） |
