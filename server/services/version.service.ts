import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HttpError } from '@/server/utils/errors'
import { EffectRepository } from '@/server/repositories/effect.repository'
import { EffectVersionRepository } from '@/server/repositories/effectVersion.repository'
import type { EffectVersionDto, CreateVersionRequest } from '@/types'
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

    // 原型以入口源码为哈希对象；code 为 base64。
    const code = Buffer.from(input.code, 'base64')
    const sha256 = createHash('sha256').update(code).digest('hex')
    const storageKey = join(String(effectId), sha256, input.entry)

    mkdirSync(join(ARTIFACTS_DIR, String(effectId), sha256), { recursive: true })
    writeFileSync(join(ARTIFACTS_DIR, storageKey), code)

    const version = await EffectVersionRepository.create({
      effectId,
      version: input.version,
      sha256,
      entry: input.entry,
      sizeBytes: code.length,
      sdkVersion: input.sdkVersion,
      schemaVersion: input.schemaVersion,
      manifestJson: input.manifestJson,
      storageKey,
      createdBy: ownerId,
    })

    // 新版本默认进 draft 指针
    await EffectRepository.update(effectId, { draftVersionId: version.id })

    return toVersionDto(version)
  },
}
