# kdanmu CLI 使用文档

`kdanmu` 是 Canvas Effect Package（弹幕效果包）的本地开发命令行工具：**脚手架 → 本地预览 →
校验 → 打包 → 上传 → 发布**。效果用 `@kaleido/sdk` 的 `defineEffect` 定义，运行时在隔离沙箱中执行；
产物是「单入口 ESM + 静态资源」，与网页 ADE 生成的作品同构。

---

## 1. 安装

发布到 npm 后：

```bash
npm i -g kdanmu          # 全局安装，得到 kdanmu 命令
# 或按工程使用（模板已把它列为 devDependency）
```

在本仓库（monorepo）内开发时，用根脚本即可，无需全局安装：

```bash
pnpm build:cli           # 构建 CLI 到 packages/cli/dist
pnpm kdanmu <命令>        # 等价于 node packages/cli/dist/index.js <命令>
```

> 前置：Node ≥ 18（用到全局 `fetch`）。上传/发布需要后端在运行。

### 后端地址（域名）

解析优先级：`--base-url` > 环境变量 `KDANMU_BASE_URL` > 默认正式域名。

- **默认（正式域名）**：`https://kdanmu.hnrobert.space`。已发布的 CLI 直接 `kdanmu login/upload/publish` 即发往正式站。
- **本地测试**：设 `KDANMU_BASE_URL=http://localhost:3000`（或某命令上加 `--base-url http://localhost:3000`）。
- 正式域名在 `cli/config.ts` 的 `DEFAULT_BASE_URL` 常量里，换域名改这一行重新 `pnpm build:cli` 即可。
- 地址在 **login 时**确定并写入 `~/.kdanmu/credentials.json`；之后 upload/publish 默认沿用登录时的地址（`--base-url` 可临时覆盖）。所以「发到哪个域名」取决于你登录的是哪个域名。

```bash
# 发往正式域名（默认）
kdanmu login && kdanmu upload

# 发往本地开发服务器
KDANMU_BASE_URL=http://localhost:3000 kdanmu login
KDANMU_BASE_URL=http://localhost:3000 kdanmu upload
```

---

## 2. 快速开始

```bash
kdanmu init my-effect     # 从内置模板创建工程
cd my-effect
npm install               # 安装 @kaleido/sdk、vite（模板已配好）
npm run dev               # = kdanmu dev，本地预览（HMR + mock 弹幕）
# 编辑 src/index.ts …
kdanmu validate           # 校验产物
kdanmu build              # 打包为 dist/entry.mjs + dist/effect.json
kdanmu login              # 浏览器授权登录（首次）
kdanmu upload             # 上传为 draft 版本
kdanmu publish --channel staging          # 发布到 staging
kdanmu publish --channel published --yes  # 公开发布（需 --yes 确认）
```

---

## 3. 工程结构

```
my-effect/
├── effect.json        # Manifest（见 §5）
├── src/
│   └── index.ts       # 入口：export default defineEffect({...})；可 import 其它 src 模块
├── assets/            # 静态资源（png/jpg/webp/gif/mp3/ogg/json）
├── dev/preview.ts     # 本地预览壳（仅 dev 用，不进打包）
├── index.html         # 预览入口（仅 dev 用）
├── vite.config.ts     # build.lib：外置 three/gsap/@kaleido/sdk
├── package.json
└── .kdanmu.json       # 与云端 Effect 的关联（upload 后自动写入，见 §7）
```

打包时 Vite 只以 `src/index.ts` 为库入口，把所有 `src/` 模块 bundle 成单个 `dist/entry.mjs`；
`index.html` / `dev/` 只在 `kdanmu dev` 时使用，不进产物。

---

## 4. 命令详解

所有命令支持 `--json`（输出结构化 JSON）与稳定退出码（成功 `0`，失败 `1`）。
失败时 `--json` 输出：`{"ok":false,"error":{"code","message"}}`。
`--cwd <dir>` 可对非当前目录的工程操作。

### `kdanmu init <name> [--cwd <dir>] [--json]`
从内置模板创建工程；写入 `effect.json`（名称）、`.kdanmu.json`（slug）、并把 `package.json` 名设为 `effect-<slug>`。
排除 `node_modules`、`dist`、`.kdanmu.json`。

### `kdanmu dev [--cwd <dir>]`
启动本地 Vite 开发服务器（默认 :5173）。预览壳直接运行你的效果，并注入 mock 弹幕、显示 fps 与运行错误；
改动 `src/index.ts` 触发 HMR 即时刷新。长驻，`Ctrl+C` 退出。

### `kdanmu build [--cwd <dir>] [--json]`
运行 `vite build` 产出 `dist/entry.mjs`（three/gsap/@kaleido/sdk 保留为外置裸 import），
收集 `assets/` 资源并计算 sha256/大小，校验后把补全的最终 Manifest 写入 `dist/effect.json`。

### `kdanmu validate [--cwd <dir>] [--json]`
若无产物会先构建，然后校验：**裸依赖白名单（仅 three/gsap/@kaleido/sdk）**、禁用 API（fetch/WebSocket/
Worker/存储/父窗口/动态 import 等）、体积限额、Manifest 结构。这套校验与运行时/服务端一致。

### `kdanmu upload [--channel <draft|staging|published>] [--base-url <url>] [--cwd <dir>] [--json]`
按需构建 → 校验 → 解析或创建云端 Effect（按 `.kdanmu.json` 的 slug/effectId）→ 创建版本（默认 `draft` 渠道）→
回写 `.kdanmu.json`。输出：`{effectId, slug, versionId, version, sha256, channel, url}`。

### `kdanmu publish --channel <draft|staging|published> [--version <semver>] [--yes] [--base-url <url>] [--cwd <dir>] [--json]`
把某版本发布到指定渠道（默认最新版本，或 `--version` 指定）。**发布到 `published` 会公开作品，必须加 `--yes`。**

### `kdanmu login [--base-url <url>] [--no-open]` / `kdanmu whoami [--json]`
`login`：浏览器 OAuth（Authorization Code + PKCE），令牌存 `~/.kdanmu/credentials.json`（chmod 600）。
`whoami`：查看当前登录用户。

---

## 5. Manifest（effect.json）

```jsonc
{
  "schemaVersion": "2",              // 运行时结构版本（真 ESM）
  "sdkVersion": "0.1.0",             // @kaleido/sdk 契约版本
  "version": "0.1.0",                // 语义化版本，同一 Effect 下不可覆盖
  "name": "示例弹幕效果",
  "entry": "entry.mjs",              // 构建产物入口文件名
  "recipe": { "symmetry": 6, "rotationSpeed": 0, "motion": "flow",
              "palette": ["#081229", "#8dd8ff"], "shardScale": 1, "trail": 0.2, "density": 1 },
  "capabilities": ["canvas", "danmaku", "three", "gsap"],
  "assets": []                        // build 时按 assets/ 目录自动补全 {path,mime,sha256,sizeBytes}
}
```

---

## 6. SDK 契约与限制

入口用 `@kaleido/sdk` 的 `defineEffect`，返回生命周期对象：

```ts
import * as THREE from "three";
import { gsap } from "gsap";
import { defineEffect, assetUrl } from "@kaleido/sdk";

export default defineEffect({
  setup({ canvas, recipe, THREE, gsap }) {
    return {
      render({ now, delta }) {},   // 必须：每帧绘制
      resize({ width, height, dpr }) {},  // 必须
      dispose() {},                 // 必须：释放资源
      onDanmaku(event) {},          // 可选：接收弹幕
      onPointer(event) {},          // 可选：指针交互
      setPlaying(playing) {},       // 可选
      reset() {},                   // 可选
    };
  },
});
```

- **只能 import** `three` / `gsap` / `@kaleido/sdk`（源码里可用相对 import，打包后会内联；externals 仅这三者）。
- **禁止** `fetch` / `XMLHttpRequest` / `WebSocket` / `EventSource` / 动态 `import()` / `Worker` / `localStorage` 等存储
  / `document.cookie` / `window.parent|top|opener` / `postMessage`。
- 资源放 `assets/`，代码里用 `assetUrl("相对路径")` 取运行时 URL（运行时以 blob 注入，禁止 fetch）。
- 限额：入口 ≤ 1MB、单资源 ≤ 5MB、总包 ≤ 8MB、资源数 ≤ 32；资源 MIME 白名单见 §5 校验。

---

## 7. 关联文件 `.kdanmu.json`

```jsonc
{ "slug": "my-effect", "effectId": 12, "baseUrl": "http://localhost:3000" }
```

`upload` 首次会按 slug 解析或创建云端 Effect，并写回 `effectId`。之后 upload/publish 都据此定位。
该文件不随包上传，建议加入工程 `.gitignore`。

---

## 8. 发布渠道与版本

- 版本**不可原地覆盖**：重复 `version` 上传会返回 `version_exists`，需在 `effect.json` 递增 `version`。
- 三个渠道指针 `draft` / `staging` / `published` 相互独立，`publish` 只是切换指针，可随时回滚到任意历史版本。
- `published` 表示公开，`kdanmu publish --channel published` 需要 `--yes`。

---

## 9. 把 CLI 发布到 npm（GitHub Action 自动发布）

本仓库把可发布产物拆成两个 npm 包：`@kaleido/sdk`（运行时 SDK）与 `kdanmu`（CLI，内置模板）。
两者由 `.github/workflows/publish.yml` 在**创建 GitHub Release 时**自动发布。

**一次性准备（你需要做）：**
1. 注册 npm 账号：<https://www.npmjs.com/signup>，开启 2FA。
2. 生成自动化令牌：npm 网站 → 头像 → **Access Tokens** → *Generate New Token* → 选 **Automation**（CI 用，跳过 2FA）→ 复制。
3. 配置 GitHub Secret：仓库 **Settings → Secrets and variables → Actions → New repository secret**，
   名字 `NPM_TOKEN`，值粘贴上一步令牌。
4. `@kaleido/sdk` 是带 scope 的包，首次发布需要你在 npm 拥有 `kaleido` 组织：
   <https://www.npmjs.com/org/create>（公开包免费）。若该组织名不可用，可改用你自己的 scope（告知我改名即可）。

**发布流程：**
1. 确认要发的版本号（如 `0.2.0`）。
2. 在 GitHub 仓库 **Releases → Draft a new release**，Tag 填 `v0.2.0`，Publish release。
3. Action 自动：安装依赖 → 用 tag 版本号写入两个包 → 构建 → `npm publish` 两个包（`--access public`）。

**本地演练（不真正发布）：**
```bash
pnpm build:sdk && pnpm build:cli
pnpm --filter @kaleido/sdk publish --dry-run --no-git-checks
pnpm --filter kdanmu       publish --dry-run --no-git-checks
# 或查看将打包进 npm 的文件：
cd packages/cli && npm pack --dry-run
```
也可在 GitHub 上手动触发该工作流（workflow_dispatch，默认 dry-run）先验证一遍。

---

## 10. 已知限制

- **生产构建**（`next build`）当前受一个与本功能无关的上游 Next 预渲染 bug 阻塞（`/_global-error`），
  不影响 `next dev`、CLI、单测与 E2E。
- 目前**没有页面把「CLI 上传的某个已发布版本」的 artifact 拉回沙箱播放**——广场/Studio 播放用的是本地
  entrySource/recipe。上传结果可在数据层确认（`GET /api/effects/:id/versions/:id/artifact` 或 `data/artifacts/`）。
  “按版本回放云端产物”的页面入口为后续项。
