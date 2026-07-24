---
name: kdanmu
description: Develop, validate, build, and publish Canvas Effect Packages (弹幕效果) with the kdanmu CLI. Use when the user asks to create/scaffold an effect, run a local弹幕/danmaku effect preview, build or validate an Effect Package, or upload/publish an effect to the Kaleido platform (draft/staging/published channels). Triggers include mentions of kdanmu, effect.json, "弹幕效果", defineEffect, or the commands init/dev/build/validate/upload/publish.
---

# kdanmu — Effect Package 本地开发与发布

## Overview

`kdanmu` 是本仓库的 CLI，用于本地开发一个 **Effect Package**（单入口 ESM + 静态资源），
并上传/发布为平台上的弹幕效果。Effect 用 `kdanmu-sdk` 的 `defineEffect` 定义，运行时在隔离
沙箱中执行；只能 `import` `three` / `gsap` / `kdanmu-sdk`，禁止网络、存储、Worker、父窗口访问。

优先使用 `--json` 解析结果；命令遵循稳定退出码（成功 0，失败 1），失败时 `--json` 输出
`{"ok":false,"error":{"code","message"}}`。

## 关键约束（务必遵守）

- **不要读取或打印令牌**：凭证在 `~/.kdanmu/credentials.json`，永不 `cat`/回显。
- **不要绕过限制**：不放宽体积/资源/依赖白名单；报错就修工程，不要改校验或沙箱。
- **草稿可自动化，发布需确认**：`upload`（默认 `draft`）可自动执行；`publish --channel published`
  会**公开**作品，必须由用户明确同意，并显式加 `--yes`。
- **读 Manifest，不要猜协议**：改动前先读 `effect.json` 与其中的 `sdkVersion`/`schemaVersion`。

## 标准工作流

1. **确认登录**：`kdanmu whoami --json`。若 `ok:false` 且 code 为 `not_logged_in`/`unauthorized`，
   提示用户运行 `kdanmu login`（浏览器授权，交互式，不要代替用户完成）。
2. **获取工程**：新建用 `kdanmu init <name>`；已有工程直接进入其目录（含 `effect.json`）。
3. **读现状**：读取 `effect.json`（名称、版本、recipe、capabilities、assets）与 `src/index.ts`。
4. **修改效果**：编辑 `src/index.ts`（及 `src/` 下其他模块，构建时会被打包进单入口）。
   - 只 `import` `three` / `gsap` / `kdanmu-sdk`；资源用 `assetUrl("相对路径")`，文件放 `assets/`。
   - 移动文字要完整穿屏、离屏才回收；容量上限时丢弃新对象而非删可见对象。
5. **本地预览**（可选，长驻）：`kdanmu dev` 启动 Vite HMR 预览（注入 mock 弹幕）。
6. **校验 + 构建**：`kdanmu validate --json`；通过后 `kdanmu build --json`。修到通过为止。
7. **上传草稿**：用户要求上传时 `kdanmu upload --json`（默认 draft）。返回 `effectId/versionId/version/sha256`。
8. **发布**（需用户确认）：`kdanmu publish --channel staging --json`；公开则
   `kdanmu publish --channel published --yes --json`。

## 命令参考

| 命令 | 作用 | 关键选项 |
| --- | --- | --- |
| `kdanmu whoami --json` | 查看登录态 | `--json` |
| `kdanmu login` | 浏览器 OAuth 登录（交互式，让用户执行） | `--base-url`、`--no-open` |
| `kdanmu init <name>` | 从模板脚手架新工程 | `--json`、`--cwd <dir>` |
| `kdanmu dev` | Vite 开发预览（HMR，长驻，Ctrl+C 退出） | `--cwd <dir>` |
| `kdanmu build` | `vite build` 打包 + 收集资源 + 校验 + 写 `dist/effect.json` | `--json`、`--cwd` |
| `kdanmu validate` | 校验产物：裸依赖白名单 / 禁用 API / 体积限额 / Manifest | `--json`、`--cwd` |
| `kdanmu upload` | 上传为版本（默认 draft），按 slug 解析或创建 Effect | `--json`、`--channel`、`--base-url`、`--cwd` |
| `kdanmu publish` | 将版本发布到渠道；`published` 需 `--yes` | `--channel`、`--version`、`--yes`、`--json`、`--cwd` |

说明：
- 工程与云端 Effect 的关联存于 `.kdanmu.json`（`slug`/`effectId`/`baseUrl`），由 `upload` 自动写入。
- `--cwd <dir>` 可对非当前目录的工程操作，便于批处理。
- 后端地址默认取登录时保存的地址，可用 `--base-url` 或环境变量 `KDANMU_BASE_URL` 覆盖。

## 输出解析

- 成功：`upload` 返回 `{"ok":true,"effectId","slug","versionId","version","sha256","channel","url"}`。
- 失败：`{"ok":false,"error":{"code","message"}}`，退出码 1。常见 code：`not_logged_in`、
  `unauthorized`、`version_exists`（版本号已存在，需在 `effect.json` 递增 `version`）、
  `entry_too_large`/`asset_too_large`/`package_too_large`（超限）、`unsupported_mime`（资源类型不允许）。

## 排错要点

- `version_exists`：把 `effect.json` 的 `version` 按语义化版本递增后重新 `build` + `upload`。
- 校验报「只能导入」：`src` 里出现了 three/gsap/kdanmu-sdk 之外的裸依赖或对 URL 的动态 import。
- 校验报「不允许使用 …」：用到了 fetch/WebSocket/Worker/存储/父窗口等被禁 API，改用允许的方式。
- 连接失败：确认后端在运行、`--base-url` 正确、已 `kdanmu login`。
