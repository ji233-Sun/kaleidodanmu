// kdanmu 构建与产物收集：调用工程本地的 Vite 打包，再收集入口 + 静态资源、计算哈希、
// 复用应用侧的 validateEffectSource / EffectManifestSchema / LIMITS 做一致校验。

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { validateEffectSource } from '@/lib/runtime/effect'
import { EffectManifestSchema, LIMITS, type EffectManifest } from '@/types/manifest'
import { mimeForPath, readManifest } from './project'

export interface CollectedAsset {
  path: string
  mime: string
  sha256: string
  sizeBytes: number
  data: string // base64
}

export interface Artifact {
  manifest: EffectManifest // 补全 assets 后的最终 Manifest
  entryPath: string
  entryCode: string // base64
  entrySize: number
  assets: CollectedAsset[]
  totalBytes: number
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** 定位工程本地的 vite 可执行文件（从工程根解析）。 */
function resolveViteBin(root: string): string {
  const req = createRequire(join(root, 'package.json'))
  const pkgPath = req.resolve('vite/package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { bin?: string | Record<string, string> }
  const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.vite
  if (!rel) throw new Error('无法在工程依赖中定位 vite 可执行文件，请先在工程内安装依赖')
  return join(dirname(pkgPath), rel)
}

/** 运行 `vite build`（用工程本地的 vite）。失败抛错。 */
export function runViteBuild(root: string): void {
  const viteBin = resolveViteBin(root)
  const result = spawnSync(process.execPath, [viteBin, 'build'], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`vite build 失败（退出码 ${result.status ?? 'null'}）`)
  }
}

/** 启动 `vite` 开发服务器（阻塞，直到用户中断）。 */
export function runViteDev(root: string, extraArgs: string[] = []): number {
  const viteBin = resolveViteBin(root)
  const result = spawnSync(process.execPath, [viteBin, ...extraArgs], { cwd: root, stdio: 'inherit' })
  return result.status ?? 0
}

/** 递归收集 assets/ 下的静态资源；path 为相对 assets 目录的路径（供 assetUrl 使用）。 */
function collectAssets(root: string): CollectedAsset[] {
  const assetsDir = join(root, 'assets')
  if (!existsSync(assetsDir)) return []
  const out: CollectedAsset[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(abs)
        continue
      }
      const rel = relative(assetsDir, abs).split(sep).join('/')
      if (rel.toLowerCase().endsWith('readme.md')) continue
      const mime = mimeForPath(rel)
      if (!mime) {
        throw new Error(`资源 assets/${rel} 的类型不受支持（允许：${LIMITS.allowedAssetMime.join(', ')}）`)
      }
      const bytes = readFileSync(abs)
      out.push({ path: rel, mime, sha256: sha256Hex(bytes), sizeBytes: bytes.length, data: bytes.toString('base64') })
    }
  }
  walk(assetsDir)
  return out
}

/**
 * 收集并校验构建产物。要求 dist/<entry> 已存在（先 runViteBuild）。
 * 复用运行时的 validateEffectSource（裸依赖白名单 / 禁用 API / 体积）与 Manifest schema，
 * 并强制 LIMITS 限额，尽早给出与服务端一致的反馈。
 */
export function collectAndValidate(root: string): Artifact {
  const manifest = readManifest(root)
  const entryAbs = join(root, 'dist', manifest.entry)
  if (!existsSync(entryAbs)) {
    throw new Error(`未找到构建产物 dist/${manifest.entry}，请先执行 kdanmu build`)
  }
  const entryBytes = readFileSync(entryAbs)
  const entryText = entryBytes.toString('utf8')

  // 运行时一致的安全校验（打包后的 ESM，裸依赖应只剩 three/gsap/@kaleido/sdk）
  validateEffectSource(entryText)
  if (entryBytes.length > LIMITS.maxEntryBytes) {
    throw new Error(`入口 ${manifest.entry} 体积 ${entryBytes.length} 超过上限 ${LIMITS.maxEntryBytes}`)
  }

  const assets = collectAssets(root)
  if (assets.length > LIMITS.maxAssets) {
    throw new Error(`资源数量 ${assets.length} 超过上限 ${LIMITS.maxAssets}`)
  }
  let totalBytes = entryBytes.length
  for (const a of assets) {
    if (a.sizeBytes > LIMITS.maxAssetBytes) {
      throw new Error(`资源 ${a.path} 体积 ${a.sizeBytes} 超过上限 ${LIMITS.maxAssetBytes}`)
    }
    totalBytes += a.sizeBytes
  }
  if (totalBytes > LIMITS.maxTotalBytes) {
    throw new Error(`包总体积 ${totalBytes} 超过上限 ${LIMITS.maxTotalBytes}`)
  }

  // 用收集到的资源清单补全最终 Manifest 并再次校验
  const finalManifest = EffectManifestSchema.parse({
    ...manifest,
    assets: assets.map(({ path, mime, sha256, sizeBytes }) => ({ path, mime, sha256, sizeBytes })),
  })

  return {
    manifest: finalManifest,
    entryPath: manifest.entry,
    entryCode: entryBytes.toString('base64'),
    entrySize: entryBytes.length,
    assets,
    totalBytes,
  }
}
