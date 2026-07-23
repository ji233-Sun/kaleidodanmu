import { HttpError } from '@/server/utils/errors'
import { EffectRepository } from '@/server/repositories/effect.repository'
import { DraftRepository } from '@/server/repositories/draft.repository'
import type { DraftDto } from '@/types'
import type { Draft } from '@/server/database/entities/draft.entity'

export function toDraftDto(d: Draft): DraftDto {
  return {
    id: d.id,
    effectId: d.effectId,
    ownerId: d.ownerId,
    snapshotJson: d.snapshotJson,
    updatedAt: d.updatedAt.toISOString(),
  }
}

async function assertOwned(effectId: number, ownerId: number) {
  if (!(await EffectRepository.findByIdOwned(effectId, ownerId))) {
    throw new HttpError(404, 'not_found', 'Effect not found')
  }
}

export const DraftService = {
  async get(effectId: number, ownerId: number) {
    await assertOwned(effectId, ownerId)
    const draft = await DraftRepository.findByEffectOwned(effectId, ownerId)
    return draft ? toDraftDto(draft) : null
  },

  async save(effectId: number, ownerId: number, snapshotJson: string) {
    await assertOwned(effectId, ownerId)
    return toDraftDto(await DraftRepository.upsert({ effectId, ownerId, snapshotJson }))
  },
}
