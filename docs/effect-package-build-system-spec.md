# Effect Package 构建系统 Spec（Vite + CLI + Skill）

> 本文件是"基于 Vite 的本地开发 / 上传为弹幕效果"的构建系统实施规范，作为后续逐步执行的唯一事实来源。
> 关联文档：[技术选型与实现方案](./bilibili-kaleidoscope-danmaku-technical-plan.md)。

## 0. 已锁定的决策

| 决策项 | 选择 |
| --- | --- |
| build 产物契约 | **Vite `build.lib` → 真 ESM**（外置 three/gsap） |
| v1 打包范围 | **多文件 + 静态资源**（图片/音频/json，非 JS 资源） |
| 代码组织 | **抽到 `packages/` workspace**（`kdanmu-sdk` 等共享包） |

### 0.1 核心架构收敛点（基石）

ADE 生成的受限单文件源码**本身就是一个合法 ES Module**：它以 `import * as THREE from "three"` /
`import { gsap } from "gsap"` / `import { defineEffect } from "kdanmu-sdk"` 开头，以
`export default defineEffect(...)` 结尾。因此：

- **运行时统一改为**：把「模块文本」转成 `Blob` → `URL.createObjectURL` → `await import(blobUrl)` → 取
  `mod.default`。裸依赖 `three` / `gsap` / `kdanmu-sdk` **由运行时把入口里的 import 说明符重写为同源 vendor
  URL**（`/kaleido-runtime/vendor/*.mjs`），无需 import map；vendor 由 esbuild 预打包成自包含 ESM。
- ADE 源码（未打包）与 CLI 的 Vite bundle（已打包、three/gsap 外置）走**完全相同**的加载路径。
- 删除现有 `new Function(...)` + 正则剥 import 的执行方式（`transformEffectSource`）。
- `kdanmu-sdk` 从"虚拟 import"变成**真实包**，同样重写为 vendor URL 加载。

### 0.2 "多文件"的准确含义（避免误期望）

`build.lib` + Rollup 会把**所有 JS/TS 源码 bundle 成单个 ESM 入口**，运行时**永远只加载一个 JS 入口**。
因此"多文件"在运行时等于：**1 个 bundled ESM 入口 + N 个静态资源**（图片/音频/json）。真正的新增工作量
集中在静态资源的**存储、交付、限额**，而不是多 JS 模块加载。资源通过宿主注入的 `blob:` URL 交付，Effect
代码用 SDK 的资源解析 API（如 `assetUrl("bg.png")`）取 URL，而不是 `fetch`。

## 1. 现状基线（已存在，可复用）

- 运行时：`lib/runtime/effect.ts`（`defineEffect` 生命周期、`validateEffectSource`、`transformEffectSource`、
  `DEFAULT_EFFECT_SOURCE`）、`app/effect-runtime/page.tsx`（`new Function` 执行 + 网络禁用 + MessageChannel）。
- 沙箱：`components/player/effect-sandbox.tsx`（iframe + MessageChannel 握手，`load/danmaku/playing/reset`）。
- SDK 类型散落在 `lib/runtime/effect.ts` 与 `lib/types.ts`（`DanmakuEvent` / `Recipe`）。
- 服务端上传契约：`POST /api/effects`（按 slug 建）、`POST /api/effects/:id/versions`
  （`CreateVersionSchema`：单 `entry` + 单 `code`(base64) + `manifestJson`）、`POST /api/effects/:id/publish`。
  `version.service.ts` 只写单文件到 `data/artifacts/<effectId>/<sha256>/<entry>`。
- 鉴权：OAuth 签发 `kdt_` token（`token.service.ts`），`getCurrentUser` 认 `Bearer kdt_*`
  （`server/utils/http.ts`）。**CLI 现有登录令牌已可直接调 versions/publish。`requireUser` 目前不校验 scope。**
- Web 上传现状：`components/studio/cloud-panel.tsx` 把 `entrySource` base64 后按 `entry:"index.js"`、
  `sdkVersion:"0.1.0"`、`schemaVersion:"1"` 上传（即把 `code` 当原始单文件源码）。
- CLI：`cli/index.ts`（ping/login/whoami；init/dev/build/validate/upload/publish 预留）、`cli/auth.ts`
  （OAuth PKCE，凭证存 `~/.kdanmu/credentials.json`）。tsup 构建到 `dist/cli`。
- CSP（`next.config.ts` 的 `/effect-runtime`）：`script-src 'self' 'unsafe-inline' 'unsafe-eval'`、
  `img-src 'self' data: blob:`、`media-src 'none'`、prod `connect-src 'none'`。
- workspace：`pnpm-workspace.yaml` **无 `packages:` 字段**（需新增）。three 0.185.1 / gsap 3.15.0。

## 2. 目标产物形态

### 2.1 Effect Package 目录（本地 / 模板）

```
my-effect/
├── effect.json          # Manifest（见 §3）
├── src/
│   └── index.ts         # 入口，export default defineEffect({...})，可 import 其他 src 模块
├── assets/              # 静态资源（可选）：png/jpg/webp/mp3/ogg/json
├── package.json         # 依赖 kdanmu-sdk（workspace/发布版），devDep vite
├── vite.config.ts       # build.lib es，external: three/gsap/kdanmu-sdk
├── tsconfig.json
└── .gitignore
```

### 2.2 build 产物（上传物）

```
dist/
├── entry.mjs            # bundled ESM（三方 three/gsap/kdanmu-sdk 保留为裸 import）
├── assets/...           # 处理后的静态资源
└── effect.json          # 补全 sha256/size/assets 的最终 Manifest
```

## 3. 共享契约：Manifest（`types/manifest.ts`）

```ts
// 版本常量（集中定义，供 CLI / server / ADE 共用）
export const SCHEMA_VERSION = "2"          // 从旧的 "1"（new Function 源码）升到 "2"（ESM）
export const SDK_VERSION = "0.1.0"
export const LIMITS = {
  maxEntryBytes: 1_000_000,    // 入口 ESM 上限 1MB
  maxAssetBytes: 5_000_000,    // 单资源 5MB
  maxTotalBytes: 8_000_000,    // 总体积
  maxAssets: 32,
  allowedAssetMime: ["image/png","image/jpeg","image/webp","image/gif","audio/mpeg","audio/ogg","application/json"],
} as const

export const AssetSchema = z.object({
  path: z.string().regex(/^[a-zA-Z0-9._\-\/]+$/).refine(p => !p.includes("..")), // 禁路径穿越
  mime: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  sizeBytes: z.number().int().nonnegative(),
})

export const EffectManifestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  sdkVersion: z.string(),
  version: z.string().regex(SEMVER_REGEX),
  name: z.string().trim().min(1).max(64),
  entry: z.string(),                         // 如 "entry.mjs"
  recipe: RecipeSchema,                      // 从 lib/ade/project.ts 抽到共享
  capabilities: z.array(z.enum(["canvas","danmaku","pointer","three","gsap"])).default([]),
  assets: z.array(AssetSchema).max(LIMITS.maxAssets).default([]),
}).strict()
```

- `RecipeSchema` 从 `lib/ade/project.ts` 提取到 `types/`（或 `kdanmu-sdk`），保持单一来源。
- 校验规则：semver、entry 存在、资源 path 无穿越、mime 白名单、逐项与总体积上限、资源数上限。

## 4. 上传契约变更（`types/version.ts` + 服务端）

### 4.1 请求体（`CreateVersionSchema` 扩展为多文件）

```ts
export const CreateVersionSchema = z.object({
  version: z.string().regex(SEMVER_REGEX),
  entry: z.string().min(1),
  sdkVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  manifestJson: z.string(),                  // 完整 Manifest 快照
  code: z.string(),                          // 入口 ESM 的 base64
  assets: z.array(z.object({                 // 新增：静态资源
    path: z.string(),
    mime: z.string(),
    data: z.string(),                        // base64
  })).max(LIMITS.maxAssets).default([]),
  channel: z.enum(["draft","staging","published"]).optional(),
})
```

### 4.2 存储与实体

- `EffectVersion` 新增可空列 `assets_json`（TypeORM `synchronize` 自动加列，nullable 安全）：存资源清单
  `[{path, mime, sha256, sizeBytes, storageKey}]`。
- 产物落盘目录：`data/artifacts/<effectId>/<versionSha>/`，其中 `entry.mjs` + `assets/<path>`。
- `versionSha` = 对 (entry 内容 + 各资源内容按 path 排序) 计算的聚合 SHA-256；`sizeBytes` = 总字节数。
- `version.service.create` 校验：Manifest 解析、path 穿越、mime、逐项/总上限、资源数；逐一写盘；写入实体。

### 4.3 产物读取路由（新增，运行时加载云端包所需）

- `GET /api/effects/:id/versions/:versionId/artifact`：返回 `{ manifest, entry: <module text>, assets: [{path, mime, dataBase64}] }`
  （或分资源返回）。供播放器/广场加载已发布包。**当前仓库没有任何服务已存产物的路由**，本项补齐。
- 权限：owner 可读任意版本；public/published 版本对所有人可读。

## 5. 里程碑与执行顺序

> 每个里程碑结束后运行 `pnpm test` + `pnpm lint` + 相关 `tsc`，通过再进下一步。

### M0 — Workspace 化 + `kdanmu-sdk` 包骨架
- `pnpm-workspace.yaml` 增加 `packages: ['packages/*']`。
- 新建 `packages/sdk`：`package.json`（name `kdanmu-sdk`、`type:module`、exports、peerDeps
  three@0.185.1 / gsap@3.15.0、用 tsup 出 ESM + d.ts）、`src/index.ts`（`defineEffect` 为 identity、
  资源解析 API `assetUrl`）、`src/types.ts`（迁移 `EffectDefinition/EffectInstance/EffectViewport/
  EffectFrame/EffectPointerEvent/DanmakuEvent/Recipe/RuntimeCommand/RuntimeEvent`）。
- 根 `package.json` 增 `"kdanmu-sdk": "workspace:*"`。
- 回接：`lib/runtime/effect.ts`、`lib/types.ts` 改为从 `kdanmu-sdk` re-export，避免漂移与破坏现有 import。
- 验收：`pnpm install` 成功；`pnpm build`（Next）与 `pnpm test` 不回归；SDK 可被 app 引用。

### M1 — 共享 Manifest 契约 + 版本常量
- 抽 `RecipeSchema` 到共享位置（`types/` 或 `kdanmu-sdk`），`lib/ade/project.ts` 改引用。
- 新建 `types/manifest.ts`（§3）；`types/index.ts` 导出。
- 扩展 `types/version.ts` 的 `CreateVersionSchema`（§4.1）。
- 验收：schema 单测（合法/非法 Manifest、穿越 path、超限资源）通过。

### M2 — 服务端多文件存储 + 校验 + 产物路由
- `EffectVersion` 加 `assetsJson` 列；`effectVersion.repository` / `version.service` 支持多文件（§4.2）。
- 新增产物读取路由（§4.3）。
- 更新 `components/studio/cloud-panel.tsx`：按新契约上传（`schemaVersion:"2"`、带 `assets:[]`、Manifest 用
  `EffectManifestSchema`）。
- 验收：`tests/services.test.ts` / `tests/routes.test.ts` 覆盖多文件上传、穿越拒绝、限额拒绝、产物读取；
  Web 端上传旧作品仍工作（entrySource 作为单入口、无资源）。

### M3 — 运行时统一 ESM 加载（blob + import map）+ CSP + 资源注入【动共享代码，最关键】
- 预置 vendor ESM：新增脚本 `scripts/build-runtime-vendor.ts`，用 esbuild 把 three、gsap、`kdanmu-sdk`
  各自 bundle 成自包含 ESM，输出到 `public/effect-runtime/vendor/{three,gsap,kaleido-sdk}.mjs`；生成 import map。
  接入 `prebuild`/`predev`（package.json script）。
- `app/effect-runtime/page.tsx`：
  - 在文档 `<head>` 注入 import map（`three`/`gsap`/`kdanmu-sdk` → vendor URL）。
  - 用 `Blob` + `import(blobUrl)` 替换 `compileEffect(new Function)`；取 `mod.default` 作为 `EffectDefinition`。
  - 收到 `load` 时把资源（base64 → Blob → objectURL）注册进 `kdanmu-sdk` 的资源表，供 `assetUrl` 解析；
    卸载时 `revokeObjectURL`。
  - 保留网络禁用、FPS、错误上报、pointer/danmaku。
- `lib/runtime/effect.ts`：删除 `transformEffectSource`；`validateEffectSource` 重写为 ESM 校验——裸 import
  白名单仅 `three`/`gsap`/`kdanmu-sdk`；禁任意 URL / 相对路径动态 import；禁 `fetch/XHR/WebSocket/
  EventSource/Worker/postMessage/parent/cookie/storage`；体积上限用 `LIMITS`。运行时以 CSP 为主防线。
- `components/player/effect-sandbox.tsx`：`load` payload 改为 `{ module: string, assets, recipe, playing }`。
- `next.config.ts` CSP：`script-src` 加 `blob:`；`media-src` 加 `blob:`（音频资源）；`connect-src 'none'`
  维持（blob import 不需要 connect-src）。
- ADE 路径：`lib/ade/project.ts` 的 `index.ts` 校验改用新 `validateEffectSource`；ADE 原始源码经同一 loader
  预览（无需构建）。
- 验收：Studio 预览、ADE 生成/预览、广场播放均正常；示例 Effect 在 blob-import 下渲染；网络仍被 CSP 挡住。

### M4 — Vite 模板 + SDK 消费
- 新建 `packages/template`（或 `cli/template/`）：§2.1 结构；`vite.config.ts` 用 `build.lib`（`formats:['es']`、
  单入口 `src/index.ts`、`rollupOptions.external:['three','gsap','kdanmu-sdk']`）；`src/index.ts` 用
  `DEFAULT_EFFECT_SOURCE` 等价内容改写为可 import `kdanmu-sdk` 的 TS。
- 资源引用约定：`import bgUrl from "../assets/bg.png"` 或 `assetUrl("bg.png")`；dev 与 build 一致解析并映射到
  运行时资源表。
- 验收：模板 `vite build` 产出符合 §2.2 的 `entry.mjs`（外置依赖保留裸 import），可被运行时加载。

### M5 — CLI 命令：init / dev / build / validate / upload / publish
- `cli/api.ts`：读凭证 + 封装 effects/versions/publish 调用，统一 `--json` 与退出码。
- `init <name>`：从模板脚手架；写 `effect.json`（含 slug 占位）。
- `dev`：Vite `createServer()` 程序化启动 + 预览壳（复用运行时宿主 + mock 弹幕 + FPS/错误）+ HMR。
- `validate`：Manifest + ESM 裸依赖白名单 + 限额（复用 M1/M3 校验）。
- `build`：`vite build` → 收集 `dist/entry.mjs` + assets → 计算 sha256/size → 生成最终 `effect.json`。
- `upload [--channel draft]`：resolve/create effect（按 slug；本地 `.kdanmu/project.json` 记录 effectId/slug）
  → `POST versions`（多文件、默认 draft）→ 输出版本号/哈希/URL。
- `publish --channel <staging|published> [--version x]`：`POST publish`；`published` 需 `--yes` 显式确认。
- 验收：登录态下 `init→dev→build→validate→upload` 全链路无需手工复制 token；`--json` 输出稳定。

### M6 — Skill（kdanmu）
- 在 `.qoder/`（或按 skill-creator 规范位置）新增 `kdanmu` Skill：指导 Agent 先 `whoami`/`login`、读
  Manifest 与 SDK 版本、`validate`→`build`、草稿 `upload` 可自动、`publish --published` 必须显式确认、
  不读/不输出 token、遵守体积与依赖限制、优先解析 `--json`。
- 验收：Skill 描述与触发词准确；按步骤可驱动 CLI 完成一次草稿上传。

### M7 — 测试与视觉回归
- 单测：Manifest schema、ESM 校验（白名单/穿越/限额）、`version.service` 多文件、CLI `build/validate`。
- Playwright：blob-import 运行时加载、ADE 预览、示例包渲染与网络阻断。
- 验收：`pnpm test` 全绿；关键路径 E2E 通过。

## 6. 安全模型（方案二下的重定）

- **运行时以 CSP + iframe sandbox 为主防线**：prod iframe `sandbox="allow-scripts"`（无 same-origin）；CSP
  `default-src 'none'`、`script-src 'self' blob:`、`img-src 'self' data: blob:`、`media-src 'self' blob:`、
  `connect-src 'none'`、`object-src 'none'`、`base-uri 'none'`、`form-action 'none'`。
- **静态校验为辅**：裸 import 仅允许 three/gsap/kdanmu-sdk；禁 URL/相对动态 import；禁网络/存储/Worker/
  父窗口/消息通道 API；体积/资源限额。对打包产物不再用"禁止一切 import"的正则。
- 资源只通过宿主注入的 `blob:` URL 交付；Effect 不能 `fetch`。父页面不向 iframe 暴露登录态/API token/媒体元素。
- 版本不可原地覆盖，只通过 `draft/staging/published` 指针切换与回滚。

## 7. 风险与缓解

- **运行时改造影响 Studio/ADE/广场共享代码** → M3 单独里程碑 + Playwright 视觉回归；灰度：先在 dev 用
  `allow-same-origin` 验证，再收紧 prod CSP。
- **import map + blob import 的浏览器时序**（import map 必须在任何模块加载前注入）→ 服务端渲染的 `/effect-runtime`
  页在 `<head>` 静态注入 import map，effect 仅通过 `load` 命令按需 `import(blob)`。
- **gsap ESM 多文件** → vendor 预构建用 esbuild bundle 成单文件 ESM。
- **schemaVersion 从 1 升到 2** → 旧版本包（new Function 源码）与新版本包（ESM）并存；运行时按 schemaVersion
  选择加载路径，或数据层无历史包时直接切换（原型阶段 `data/` 未提交，倾向直接切换）。
- **scope 未强制** → 原型保持（记为已知项）；`publish --published` 由 CLI 端显式确认兜底。

## 8. 范围外（本期不做）

对象存储 / PostgreSQL / 正式身份系统 / 协同编辑 / 计费 / 复杂审核；多 JS 模块的运行时按需加载（build 已 bundle
成单入口）；Device Code 登录（已用 PKCE loopback）。
