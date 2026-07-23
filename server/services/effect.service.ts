import { HttpError } from '@/server/utils/errors'
import { EffectRepository } from '@/server/repositories/effect.repository'
import { EffectVersionRepository } from '@/server/repositories/effectVersion.repository'
import type {
  EffectDto,
  EffectChannel,
  CreateEffectRequest,
  UpdateEffectRequest,
} from '@/types'
import type { Effect } from '@/server/database/entities/effect.entity'

export function toEffectDto(e: Effect): EffectDto {
  return {
    id: e.id,
    ownerId: e.ownerId,
    slug: e.slug,
    name: e.name,
    draftVersionId: e.draftVersionId,
    stagingVersionId: e.stagingVersionId,
    publishedVersionId: e.publishedVersionId,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }
}

async function getOwnedOrThrow(id: number, ownerId: number): Promise<Effect> {
  const effect = await EffectRepository.findByIdOwned(id, ownerId)
  if (!effect) throw new HttpError(404, 'not_found', 'Effect not found')
  return effect
}

export const EffectService = {
  async list(ownerId: number) {
    const effects = await EffectRepository.findAllByOwner(ownerId)
    return effects.map(toEffectDto)
  },

  async get(id: number, ownerId: number) {
    return toEffectDto(await getOwnedOrThrow(id, ownerId))
  },

  async create(input: CreateEffectRequest & { ownerId: number }) {
    if (await EffectRepository.findBySlug(input.slug)) {
      throw new HttpError(409, 'slug_already_taken', 'Slug already taken')
    }
    const effect = await EffectRepository.create({
      ownerId: input.ownerId,
      slug: input.slug,
      name: input.name,
    })
    return toEffectDto(effect)
  },

  async update(id: number, ownerId: number, input: UpdateEffectRequest) {
    const effect = await getOwnedOrThrow(id, ownerId)
    if (input.slug && input.slug !== effect.slug) {
      if (await EffectRepository.findBySlug(input.slug)) {
        throw new HttpError(409, 'slug_already_taken', 'Slug already taken')
      }
    }
    await EffectRepository.update(id, input)
    return toEffectDto((await EffectRepository.findById(id))!)
  },

  async remove(id: number, ownerId: number) {
    await getOwnedOrThrow(id, ownerId)
    await EffectRepository.delete(id)
  },

  async publish(id: number, ownerId: number, versionId: number, channel: EffectChannel) {
    const effect = await getOwnedOrThrow(id, ownerId)
    const version = await EffectVersionRepository.findById(versionId)
    if (!version || version.effectId !== effect.id) {
      throw new HttpError(404, 'version_not_found', 'Version not found for this effect')
    }
    const patch: Partial<
      Pick<Effect, 'draftVersionId' | 'stagingVersionId' | 'publishedVersionId'>
    > =
      channel === 'draft'
        ? { draftVersionId: versionId }
        : channel === 'staging'
          ? { stagingVersionId: versionId }
          : { publishedVersionId: versionId }
    await EffectRepository.update(id, patch)
    return toEffectDto((await EffectRepository.findById(id))!)
  },
}
