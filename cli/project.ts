// kdanmu 本地工程助手：读取 effect.json（Manifest）、维护 .kdanmu.json 关联文件、slug 与 MIME 推断。

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EffectManifestSchema, type EffectManifest } from '@/types/manifest'

export const MANIFEST_FILE = 'effect.json'
export const LINK_FILE = '.kdanmu.json'

/** 本地工程与云端 Effect 的关联信息（不随包上传）。 */
export interface ProjectLink {
  slug: string
  effectId?: number
  baseUrl?: string
}

export function manifestPath(root: string): string {
  return join(root, MANIFEST_FILE)
}

export function hasManifest(root: string): boolean {
  return existsSync(manifestPath(root))
}

/** 读取并校验 effect.json；非法时抛出可读错误。 */
export function readManifest(root: string): EffectManifest {
  const path = manifestPath(root)
  if (!existsSync(path)) {
    throw new Error(`当前目录缺少 ${MANIFEST_FILE}，请在 Effect 工程根目录运行，或先执行 kdanmu init`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error(`${MANIFEST_FILE} 不是合法 JSON`)
  }
  const result = EffectManifestSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`${MANIFEST_FILE} 校验失败：${result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
  }
  return result.data
}

export function writeManifest(root: string, manifest: EffectManifest): void {
  writeFileSync(manifestPath(root), JSON.stringify(manifest, null, 2) + '\n')
}

export function readLink(root: string): ProjectLink | null {
  const path = join(root, LINK_FILE)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ProjectLink
  } catch {
    return null
  }
}

export function writeLink(root: string, link: ProjectLink): void {
  writeFileSync(join(root, LINK_FILE), JSON.stringify(link, null, 2) + '\n')
}

/** 由名称生成合法 slug：小写、非法字符转连字符、去除首尾连字符、限长；空则回退 fx。 */
export function sanitizeSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return /^[a-z0-9]/.test(slug) ? slug : `fx-${slug}`.slice(0, 64)
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.json': 'application/json',
}

export function mimeForPath(path: string): string | null {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return null
  return MIME_BY_EXT[path.slice(dot).toLowerCase()] ?? null
}
