# 前后端缺口分析

> 基于 `types/` 下的 API 契约（Zod schema + DTO）、`app/api/` 已实现的路由、以及前端现有页面（`app/`、`lib/profile.ts`、`lib/square.ts` 中的 mock 注释）整理。
> 生成时间：2026-07-23

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
| `/studio` | 对话式创作 + 预览 | localStorage（`lib/store.ts`）+ Mock Agent |
| `/mine` | 我的万花筒 | localStorage |
| `/square` | 万花筒广场 | Mock 数据（`lib/square.ts`） |
| `/u/[name]` | 个人主页 | Mock 数据（`lib/profile.ts`） |
| `/oauth/authorize` | OAuth 授权页 | **整体 Mock**，授权码为前端伪造 |

---

## 一、前端缺少的页面

### 1. 登录 / 注册页（优先级最高）

- 后端已有 `register` / `login` / `logout` / `me` 全套接口，但前端没有任何登录、注册入口和页面。
- 目前所有页面都假设了 Mock 用户：`components/site-header.tsx` 硬编码 `/u/碎镜师傅`，`app/oauth/authorize/page.tsx` 硬编码 `MOCK_USER`。
- 需要：`/login`、`/register` 页面 + 头部登录态展示（未登录显示登录按钮，已登录显示真实用户主页链接）。

### 2. API Token 管理页

- 后端 `GET/POST /api/tokens`、`DELETE /api/tokens/:id` 已实现，契约含 `CreatedApiTokenDto`（仅创建时返回一次明文）。
- 这是 CLI（`kdanmu login`）之外的凭证管理入口，前端完全没有对应页面。
- 需要：`/settings/tokens`（或 `/mine/tokens`）页面，支持创建（选 scopes、有效期）、列表、吊销；创建成功后展示一次明文 token。

### 3. 版本历史与发布管理 UI

- 后端已有 versions（列表/上传）、publish（`draft/staging/published` 三渠道指针）接口，契约含 `EffectVersionDto`、`PublishEffectRequest`。
- `/studio` 目前只有 localStorage 里的本地版本号自增，没有版本列表、渠道状态展示和发布/回滚操作。
- 需要：Studio 内的版本历史面板（版本列表、当前 draft/staging/published 指针、切换与回滚按钮）。技术方案 §3 也明确 Creator Studio 包含「版本切换」。

### 4. 广场作品详情页

- 广场卡片目前只有「使用」「二创」两个操作，无法查看单个作品的详情。
- `lib/profile.ts` 已按「作品详情」的形态定义了 mock：二创列表（`fetchDerivatives`）、点赞/投币/收藏（`postInteraction`），但没有页面承载。
- 需要：`/square/[id]`（或 `/effect/[id]`）详情页：大预览、作者信息、统计（点赞/投币/收藏/二创数）、二创列表、互动按钮。

### 5. 应用设置页（可选，取决于 settings 的定位）

- 后端 `GET /api/settings`、`GET/PUT /api/settings/:key` 已实现。
- 若 settings 是平台级配置（如 LLM 代理开关、限制参数），需要一个管理页面；若仅供服务端内部使用则不需要页面。需与后端确认定位。

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

### 5. OAuth 授权流程接口（CLI 登录链路）

- `/oauth/authorize` 页是纯 Mock：授权码由前端 `kld_mock_` 前缀伪造，未经任何服务端校验。
- 技术方案 §7 要求 Authorization Code + PKCE 和 Device Code 两种流程。
- 需要：
  - `POST /api/oauth/authorize` —— 已登录用户同意授权，签发授权码（校验 client_id、redirect_uri、scope、PKCE challenge）。
  - `POST /api/oauth/token` —— 授权码 + code_verifier 交换 access/refresh token。
  - `POST /api/oauth/device/code` + Device Code 轮询交换接口 —— 无浏览器环境使用。
  - scope 目录需与前端 `SCOPE_CATALOG`（`profile:read` / `effects:read` / `effects:write` / `square:publish`）对齐。

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
| P0 | 登录/注册页 + 前端会话接入（否则所有已实现的鉴权接口无法被前端使用） |
| P0 | 契约对齐：用户昵称、作品社区字段、id 类型 |
| P1 | 广场列表接口 + `/square` 接入真实数据 |
| P1 | Studio 接入 effects/draft/versions/publish（替换 localStorage）+ 版本历史面板 |
| P2 | OAuth 授权码/token 接口（解锁 CLI 登录）、Token 管理页 |
| P2 | 用户公开资料、作品详情页 + 互动/二创接口 |
| P3 | 弹幕 Mock 数据源、LLM 代理、应用设置页 |
