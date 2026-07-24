import { HttpError } from '@/server/utils/errors'
import { EffectRepository, type EffectCountColumn } from '@/server/repositories/effect.repository'
import { EffectLikeRepository } from '@/server/repositories/effectLike.repository'
import { EffectFavoriteRepository } from '@/server/repositories/effectFavorite.repository'
import { EffectCoinRepository } from '@/server/repositories/effectCoin.repository'
import { loadAuthorsMap, toSquareEffect, toDerivative } from './community.mapper'
import type {
  InteractionKind,
  InteractionResponse,
  DerivativeDto,
  SquareEffectDto,
} from '@/types'
import type { Effect } from '@/server/database/entities/effect.entity'

const COUNT_COL: Record<InteractionKind, EffectCountColumn> = {
  like: 'likes',
  coin: 'coins',
  favorite: 'favorites',
}

interface EffectRelationRepo {
  exists: (userId: number, effectId: number) => Promise<boolean>
  add: (data: { userId: number; effectId: number }) => Promise<unknown>
  remove?: (userId: number, effectId: number) => Promise<void>
  findEffectIdsByUser: (userId: number) => Promise<number[]>
}

/** 按 kind 路由到对应的独立关系表仓储。 */
function repoFor(kind: InteractionKind): EffectRelationRepo {
  if (kind === 'like') return EffectLikeRepository
  if (kind === 'favorite') return EffectFavoriteRepository
  return EffectCoinRepository
}

async function assertPublicPublished(effectId: number): Promise<Effect> {
  const effect = await EffectRepository.findById(effectId)
  if (!effect || effect.visibility !== 'public' || effect.publishedVersionId === null) {
    throw new HttpError(404, 'not_found', 'Effect not found')
  }
  return effect
}

export const InteractionService = {
  /** 点赞 / 投币 / 收藏 切换；coin 单向（无 remove，不可撤销）。 */
  async toggle(
    userId: number,
    effectId: number,
    kind: InteractionKind,
    on: boolean,
  ): Promise<InteractionResponse> {
    await assertPublicPublished(effectId)
    const repo = repoFor(kind)
    const col = COUNT_COL[kind]
    const exists = await repo.exists(userId, effectId)
    if (on && !exists) {
      await repo.add({ userId, effectId })
      await EffectRepository.bumpCount(effectId, col, 1)
    } else if (!on && exists && repo.remove) {
      await repo.remove(userId, effectId)
      await EffectRepository.bumpCount(effectId, col, -1)
    }
    const updated = await EffectRepository.findById(effectId)
    return { kind, on, count: updated ? (updated[col] as number) : 0 }
  },

  async recordUse(effectId: number): Promise<number> {
    await assertPublicPublished(effectId)
    await EffectRepository.bumpCount(effectId, 'uses', 1)
    const e = await EffectRepository.findById(effectId)
    return e ? e.uses : 0
  },

  /** 当前用户对某作品的互动状态（详情页 interacted）。 */
  async userState(
    userId: number | null,
    effectId: number,
  ): Promise<{ like: boolean; coin: boolean; favorite: boolean } | null> {
    if (!userId) return null
    const [like, coin, favorite] = await Promise.all([
      EffectLikeRepository.exists(userId, effectId),
      EffectCoinRepository.exists(userId, effectId),
      EffectFavoriteRepository.exists(userId, effectId),
    ])
    return { like, coin, favorite }
  },

  /** 「我的点赞 / 收藏」作品列表。 */
  async listMine(userId: number, kind: InteractionKind): Promise<SquareEffectDto[]> {
    const ids = await repoFor(kind).findEffectIdsByUser(userId)
    if (ids.length === 0) return []
    const effects = await EffectRepository.findPublicByIds(ids)
    const authors = await loadAuthorsMap(effects)
    return effects
      .filter((e) => authors.has(e.ownerId))
      .map((e) => toSquareEffect(e, authors.get(e.ownerId)!))
  },

  async listDerivatives(effectId: number, limit = 20): Promise<DerivativeDto[]> {
    const safeLimit = Math.min(Math.max(1, limit), 50)
    const effects = await EffectRepository.findDerivatives(effectId, safeLimit)
    const authors = await loadAuthorsMap(effects)
    return effects
      .filter((e) => authors.has(e.ownerId))
      .map((e) => toDerivative(e, authors.get(e.ownerId)!))
  },
}
