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

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function toEffectDto(e: Effect): EffectDto {
  return {
    id: e.id,
    ownerId: e.ownerId,
    slug: e.slug,
    name: e.name,
    forkedFrom: e.forkedFrom,
    visibility: e.visibility === 'public' ? 'public' : 'private',
    prompt: e.prompt,
    recipe: parseJson(e.recipeJson, {}),
    tags: parseJson<string[]>(e.tagsJson, []),
    likes: e.likes,
    uses: e.uses,
    remixes: e.remixes,
    coins: e.coins,
    favorites: e.favorites,
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
      prompt: input.prompt,
      recipeJson: input.recipe ? JSON.stringify(input.recipe) : undefined,
      tagsJson: input.tags ? JSON.stringify(input.tags) : undefined,
      visibility: input.visibility,
      forkedFrom: input.forkedFrom,
    })
    if (effect.forkedFrom) {
      await EffectRepository.bumpCount(effect.forkedFrom, 'remixes', 1)
    }
    return toEffectDto(effect)
  },

  async update(id: number, ownerId: number, input: UpdateEffectRequest) {
    const effect = await getOwnedOrThrow(id, ownerId)
    if (input.slug && input.slug !== effect.slug) {
      if (await EffectRepository.findBySlug(input.slug)) {
        throw new HttpError(409, 'slug_already_taken', 'Slug already taken')
      }
    }
    const data: Partial<
      Pick<Effect, 'name' | 'slug' | 'prompt' | 'visibility' | 'recipeJson' | 'tagsJson'>
    > = {}
    if (input.name !== undefined) data.name = input.name
    if (input.slug !== undefined) data.slug = input.slug
    if (input.prompt !== undefined) data.prompt = input.prompt
    if (input.visibility !== undefined) data.visibility = input.visibility
    if (input.recipe !== undefined) data.recipeJson = JSON.stringify(input.recipe)
    if (input.tags !== undefined) data.tagsJson = JSON.stringify(input.tags)
    await EffectRepository.update(id, data)
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
