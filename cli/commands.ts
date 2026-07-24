// kdanmu 子命令实现：init / dev / build / validate / upload / publish。
// 统一支持 --json（结构化输出）与稳定退出码（失败置 exitCode=1）。

import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { collectAndValidate, runViteBuild, runViteDev, type Artifact } from './build'
import { createClient, CliApiError, type EffectDto } from './api'
import {
  hasManifest,
  readLink,
  readManifest,
  sanitizeSlug,
  writeLink,
  writeManifest,
  type ProjectLink,
} from './project'

type Channel = 'draft' | 'staging' | 'published'

export interface BaseOpts {
  json?: boolean
  baseUrl?: string
  cwd?: string
}

function root(opts: BaseOpts): string {
  return resolve(opts.cwd ?? process.cwd())
}

function emit(opts: BaseOpts, payload: Record<string, unknown>, human: string[]): void {
  if (opts.json) console.log(JSON.stringify({ ok: true, ...payload }))
  else for (const line of human) console.log(line)
}

/** 统一错误处理：--json 输出 {ok:false,error}，否则打印到 stderr；置 exitCode=1。 */
export async function withErrors(opts: BaseOpts, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const code = e instanceof CliApiError ? e.code : 'error'
    if (opts.json) console.log(JSON.stringify({ ok: false, error: { code, message } }))
    else console.error(`错误：${message}`)
    process.exitCode = 1
  }
}

/** 定位内置模板目录：优先 KDANMU_TEMPLATE_DIR，其次相对 CLI 产物的仓库内路径。 */
function locateTemplate(): string {
  const candidates = [
    process.env.KDANMU_TEMPLATE_DIR,
    join(__dirname, '..', '..', 'packages', 'template'),
    join(__dirname, '..', 'packages', 'template'),
  ].filter((p): p is string => Boolean(p))
  for (const dir of candidates) {
    if (existsSync(join(dir, 'effect.json'))) return dir
  }
  throw new Error('未找到内置模板（可设置 KDANMU_TEMPLATE_DIR 指向模板目录）')
}

export function initCmd(name: string, opts: BaseOpts): Promise<void> {
  return withErrors(opts, () => {
    const target = resolve(root(opts), name)
    if (existsSync(target) && readdirSync(target).length > 0) {
      throw new Error(`目标目录已存在且非空：${target}`)
    }
    const template = locateTemplate()
    const skip = new Set(['node_modules', 'dist', '.kdanmu.json'])
    cpSync(template, target, {
      recursive: true,
      filter: (src) => !skip.has(basename(src)),
    })

    const slug = sanitizeSlug(name)
    // 写入 Effect 名称与工程关联信息
    const manifest = readManifest(target)
    manifest.name = name
    writeManifest(target, manifest)
    writeLink(target, { slug })

    const pkgPath = join(target, 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
      pkg.name = `effect-${slug}`
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    }

    emit(opts, { path: target, slug }, [
      `已创建 Effect 工程：${target}`,
      `slug：${slug}`,
      '',
      '下一步：',
      `  cd ${name}`,
      '  pnpm install     # 安装依赖（@kaleido/sdk、vite）',
      '  kdanmu dev       # 本地预览',
      '  kdanmu build     # 打包',
      '  kdanmu upload    # 上传为草稿版本（需先 kdanmu login）',
    ])
  })
}

function ensureBuilt(dir: string): void {
  const manifest = readManifest(dir)
  if (!existsSync(join(dir, 'dist', manifest.entry))) runViteBuild(dir)
}

function artifactSummary(a: Artifact): string[] {
  return [
    '校验通过 ✓',
    `  入口：${a.entryPath}（${a.entrySize} 字节）`,
    `  资源：${a.assets.length} 个`,
    `  总体积：${a.totalBytes} 字节`,
    `  版本：${a.manifest.version}  schema ${a.manifest.schemaVersion}  sdk ${a.manifest.sdkVersion}`,
  ]
}

export function validateCmd(opts: BaseOpts): Promise<void> {
  return withErrors(opts, () => {
    const dir = root(opts)
    ensureBuilt(dir)
    const artifact = collectAndValidate(dir)
    emit(
      opts,
      {
        entry: artifact.entryPath,
        entrySize: artifact.entrySize,
        assets: artifact.assets.map((a) => ({ path: a.path, mime: a.mime, sizeBytes: a.sizeBytes })),
        totalBytes: artifact.totalBytes,
        version: artifact.manifest.version,
      },
      artifactSummary(artifact),
    )
  })
}

export function buildCmd(opts: BaseOpts): Promise<void> {
  return withErrors(opts, () => {
    const dir = root(opts)
    runViteBuild(dir)
    const artifact = collectAndValidate(dir)
    // 把补全后的最终 Manifest 落到 dist/effect.json
    writeFileSync(join(dir, 'dist', 'effect.json'), JSON.stringify(artifact.manifest, null, 2) + '\n')
    emit(
      opts,
      {
        entry: artifact.entryPath,
        entrySize: artifact.entrySize,
        assets: artifact.assets.length,
        totalBytes: artifact.totalBytes,
        version: artifact.manifest.version,
      },
      ['构建完成 ✓', ...artifactSummary(artifact).slice(1), '  最终 Manifest：dist/effect.json'],
    )
  })
}

export function devCmd(opts: BaseOpts): Promise<void> {
  return withErrors(opts, () => {
    const dir = root(opts)
    if (!hasManifest(dir)) throw new Error('当前目录不是 Effect 工程（缺少 effect.json）')
    console.log('启动 Vite 开发预览（Ctrl+C 退出）…')
    const status = runViteDev(dir)
    if (status !== 0) process.exitCode = status
  })
}

function resolveEffect(
  client: ReturnType<typeof createClient>,
  link: ProjectLink,
  name: string,
): Promise<EffectDto> {
  return (async () => {
    if (link.effectId) {
      const byList = await client.listEffects()
      const found = byList.find((e) => e.id === link.effectId)
      if (found) return found
      // 关联的云端作品已不存在，回退到按 slug 解析/新建
    }
    const bySlug = await client.findBySlug(link.slug)
    if (bySlug) return bySlug
    return client.createEffect({ slug: link.slug, name })
  })()
}

export interface UploadOpts extends BaseOpts {
  channel?: Channel
}

export function uploadCmd(opts: UploadOpts): Promise<void> {
  return withErrors(opts, async () => {
    const dir = root(opts)
    ensureBuilt(dir)
    const artifact = collectAndValidate(dir)
    const client = createClient(opts.baseUrl)
    const link = readLink(dir) ?? { slug: sanitizeSlug(artifact.manifest.name) }
    const effect = await resolveEffect(client, link, artifact.manifest.name)
    const channel: Channel = opts.channel ?? 'draft'

    const version = await client.createVersion(effect.id, {
      version: artifact.manifest.version,
      entry: artifact.entryPath,
      sdkVersion: artifact.manifest.sdkVersion,
      schemaVersion: artifact.manifest.schemaVersion,
      manifestJson: JSON.stringify(artifact.manifest),
      code: artifact.entryCode,
      assets: artifact.assets.map((a) => ({ path: a.path, mime: a.mime, data: a.data })),
      channel,
    })

    writeLink(dir, { slug: effect.slug, effectId: effect.id, baseUrl: client.baseUrl })

    emit(
      opts,
      {
        effectId: effect.id,
        slug: effect.slug,
        versionId: version.id,
        version: version.version,
        sha256: version.sha256,
        channel,
        url: `${client.baseUrl}/studio`,
      },
      [
        `已上传版本 v${version.version}（effect #${effect.id} · ${effect.slug}）`,
        `  渠道：${channel}`,
        `  sha256：${version.sha256}`,
        `  体积：${version.sizeBytes} 字节`,
      ],
    )
  })
}

export interface PublishOpts extends BaseOpts {
  channel: Channel
  version?: string
  yes?: boolean
}

export function publishCmd(opts: PublishOpts): Promise<void> {
  return withErrors(opts, async () => {
    const dir = root(opts)
    const link = readLink(dir)
    if (!link?.effectId) throw new Error('尚未关联云端 Effect，请先执行 kdanmu upload')
    if (opts.channel === 'published' && !opts.yes) {
      throw new Error('发布到 published 会公开作品，请显式加 --yes 确认')
    }
    const client = createClient(opts.baseUrl)
    const versions = await client.listVersions(link.effectId)
    if (versions.length === 0) throw new Error('该 Effect 尚无任何版本，请先 kdanmu upload')
    const target = opts.version ? versions.find((v) => v.version === opts.version) : versions[0]
    if (!target) throw new Error(`未找到版本 ${opts.version}`)

    const effect = await client.publish(link.effectId, target.id, opts.channel)
    emit(
      opts,
      { effectId: effect.id, slug: effect.slug, versionId: target.id, version: target.version, channel: opts.channel },
      [`已将 v${target.version} 设为 ${opts.channel}（effect #${effect.id} · ${effect.slug}）`],
    )
  })
}
