import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { HttpError } from '@/server/utils/errors'
import { EffectRepository } from '@/server/repositories/effect.repository'
import { EffectVersionRepository } from '@/server/repositories/effectVersion.repository'
import { LIMITS, SafePathSchema } from '@/types'
import type {
  EffectVersionDto,
  CreateVersionRequest,
  StoredAsset,
  VersionArtifactResponse,
  VersionFilePayload,
} from '@/types'
import type { EffectVersion } from '@/server/database/entities/effectVersion.entity'

const ARTIFACTS_DIR = './data/artifacts'

export function toVersionDto(v: EffectVersion): EffectVersionDto {
  return {
    id: v.id,
    effectId: v.effectId,
    version: v.version,
    sha256: v.sha256,
    entry: v.entry,
    sizeBytes: v.sizeBytes,
    sdkVersion: v.sdkVersion,
    schemaVersion: v.schemaVersion,
    storageKey: v.storageKey,
    createdBy: v.createdBy,
    createdAt: v.createdAt.toISOString(),
  }
}

/** 相对路径安全校验（禁绝对路径与 .. 穿越）；失败抛 422。 */
function assertSafePath(path: string): void {
  if (!SafePathSchema.safeParse(path).success) {
    throw new HttpError(422, 'invalid_path', `非法产物路径：${path}`)
  }
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export const VersionService = {
  async list(effectId: number, ownerId: number) {
    if (!(await EffectRepository.findByIdOwned(effectId, ownerId))) {
      throw new HttpError(404, 'not_found', 'Effect not found')
    }
    const versions = await EffectVersionRepository.findAllByEffect(effectId)
    return versions.map(toVersionDto)
  },

  async create(effectId: number, ownerId: number, input: CreateVersionRequest) {
    if (!(await EffectRepository.findByIdOwned(effectId, ownerId))) {
      throw new HttpError(404, 'not_found', 'Effect not found')
    }
    if (await EffectVersionRepository.findByEffectAndVersion(effectId, input.version)) {
      throw new HttpError(409, 'version_exists', 'Version already exists')
    }

    // —— 入口校验 ——
    assertSafePath(input.entry)
    const entryCode = Buffer.from(input.code, 'base64')
    if (entryCode.length > LIMITS.maxEntryBytes) {
      throw new HttpError(413, 'entry_too_large', `入口超过 ${LIMITS.maxEntryBytes} 字节上限`)
    }
    const entrySha = sha256Hex(entryCode)

    // —— 资源校验 ——
    const rawAssets = input.assets ?? []
    if (rawAssets.length > LIMITS.maxAssets) {
      throw new HttpError(413, 'too_many_assets', `资源数量超过 ${LIMITS.maxAssets} 上限`)
    }
    const seen = new Set<string>()
    let totalBytes = entryCode.length
    const decodedAssets = rawAssets.map((a) => {
      assertSafePath(a.path)
      if (a.path === input.entry) throw new HttpError(422, 'invalid_path', '资源路径不能与入口相同')
      if (seen.has(a.path)) throw new HttpError(422, 'duplicate_path', `资源路径重复：${a.path}`)
      seen.add(a.path)
      if (!LIMITS.allowedAssetMime.includes(a.mime as (typeof LIMITS.allowedAssetMime)[number])) {
        throw new HttpError(415, 'unsupported_mime', `不支持的资源类型：${a.mime}`)
      }
      const bytes = Buffer.from(a.data, 'base64')
      if (bytes.length > LIMITS.maxAssetBytes) {
        throw new HttpError(413, 'asset_too_large', `资源 ${a.path} 超过 ${LIMITS.maxAssetBytes} 字节上限`)
      }
      totalBytes += bytes.length
      return { path: a.path, mime: a.mime, bytes, sha256: sha256Hex(bytes) }
    })
    if (totalBytes > LIMITS.maxTotalBytes) {
      throw new HttpError(413, 'package_too_large', `包总体积超过 ${LIMITS.maxTotalBytes} 字节上限`)
    }

    // —— 聚合哈希：入口 + 按 path 排序的资源，内容寻址整包 ——
    const aggregate = createHash('sha256')
    aggregate.update(`entry:${input.entry}:${entrySha}\n`)
    for (const a of [...decodedAssets].sort((x, y) => x.path.localeCompare(y.path))) {
      aggregate.update(`asset:${a.path}:${a.sha256}\n`)
    }
    const versionSha = aggregate.digest('hex')

    // —— 落盘：data/artifacts/<effectId>/<versionSha>/<path> ——
    const entryStorageKey = join(String(effectId), versionSha, input.entry)
    mkdirSync(dirname(join(ARTIFACTS_DIR, entryStorageKey)), { recursive: true })
    writeFileSync(join(ARTIFACTS_DIR, entryStorageKey), entryCode)

    const storedAssets: StoredAsset[] = decodedAssets.map((a) => {
      const storageKey = join(String(effectId), versionSha, a.path)
      const abs = join(ARTIFACTS_DIR, storageKey)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, a.bytes)
      return { path: a.path, mime: a.mime, sha256: a.sha256, sizeBytes: a.bytes.length, storageKey }
    })

    const version = await EffectVersionRepository.create({
      effectId,
      version: input.version,
      sha256: versionSha,
      entry: input.entry,
      sizeBytes: totalBytes,
      sdkVersion: input.sdkVersion,
      schemaVersion: input.schemaVersion,
      manifestJson: input.manifestJson,
      assetsJson: storedAssets.length ? JSON.stringify(storedAssets) : null,
      storageKey: entryStorageKey,
      createdBy: ownerId,
    })

    // 新版本默认进 draft 指针
    await EffectRepository.update(effectId, { draftVersionId: version.id })

    return toVersionDto(version)
  },

  /**
   * 读取某版本的完整产物（入口 + 资源）。访问控制：owner 可读任意版本；
   * 其余人仅能读 public 且已发布到 published 指针的版本。
   */
  async getArtifact(
    effectId: number,
    versionId: number,
    viewerId: number | null,
  ): Promise<VersionArtifactResponse> {
    const version = await EffectVersionRepository.findById(versionId)
    if (!version || version.effectId !== effectId) {
      throw new HttpError(404, 'not_found', 'Version not found')
    }
    const effect = await EffectRepository.findById(effectId)
    if (!effect) throw new HttpError(404, 'not_found', 'Effect not found')

    const isOwner = viewerId != null && effect.ownerId === viewerId
    const isPublic = effect.visibility === 'public' && effect.publishedVersionId === versionId
    if (!isOwner && !isPublic) {
      throw new HttpError(404, 'not_found', 'Version not found')
    }

    const readFile = (storageKey: string): Buffer => readFileSync(join(ARTIFACTS_DIR, storageKey))
    const entry: VersionFilePayload = {
      path: version.entry,
      mime: 'text/javascript',
      data: readFile(version.storageKey).toString('base64'),
    }
    const stored: StoredAsset[] = version.assetsJson ? (JSON.parse(version.assetsJson) as StoredAsset[]) : []
    const assets: VersionFilePayload[] = stored.map((a) => ({
      path: a.path,
      mime: a.mime,
      data: readFile(a.storageKey).toString('base64'),
    }))

    return { version: toVersionDto(version), manifestJson: version.manifestJson, entry, assets }
  },
}
