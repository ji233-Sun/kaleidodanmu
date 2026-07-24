import { HttpError } from '@/server/utils/errors'
import { EffectRepository, type EffectCountColumn } from '@/server/repositories/effect.repository'
import { InteractionRepository } from '@/server/repositories/effectInteraction.repository'
import { UserRepository } from '@/server/repositories/user.repository'
import { toPublicUser, toDerivative } from './community.mapper'
import type { InteractionKind, InteractionResponse, DerivativeDto } from '@/types'
import type { User } from '@/server/database/entities/user.entity'

const COUNT_COL: Record<InteractionKind, EffectCountColumn> = {
  like: 'likes',
  coin: 'coins',
  favorite: 'favorites',
}

export const InteractionService = {
  async recordUse(effectId: number): Promise<number> {
    const effect = await EffectRepository.findById(effectId)
    if (!effect || effect.visibility !== 'public' || effect.publishedVersionId === null) {
      throw new HttpError(404, 'not_found', 'Effect not found')
    }
    await EffectRepository.bumpCount(effectId, 'uses', 1)
    return effect.uses + 1
  },

  /** POST /api/effects/:id/interactions —— 点赞 / 投币 / 收藏 切换，维护计数。 */
  async toggle(
    userId: number,
    effectId: number,
    kind: InteractionKind,
    on: boolean,
  ): Promise<InteractionResponse> {
    const effect = await EffectRepository.findById(effectId)
    if (!effect || effect.visibility !== 'public' || effect.publishedVersionId === null) {
      throw new HttpError(404, 'not_found', 'Effect not found')
    }
    const col = COUNT_COL[kind]
    const exists = await InteractionRepository.exists(userId, effectId, kind)
    if (on && !exists) {
      await InteractionRepository.add({ userId, effectId, kind })
      await EffectRepository.bumpCount(effectId, col, 1)
    } else if (!on && exists) {
      await InteractionRepository.remove(userId, effectId, kind)
      await EffectRepository.bumpCount(effectId, col, -1)
    }
    const updated = await EffectRepository.findById(effectId)
    return { kind, on, count: updated ? (updated[col] as number) : 0 }
  },

  /** GET /api/effects/:id/derivatives —— 二创列表（forkedFrom = id）。 */
  async listDerivatives(effectId: number, limit = 20): Promise<DerivativeDto[]> {
    const safeLimit = Math.min(Math.max(1, limit), 50)
    const effects = await EffectRepository.findDerivatives(effectId, safeLimit)
    const ownerIds = [...new Set(effects.map((e) => e.ownerId))]
    const users = await Promise.all(ownerIds.map((id) => UserRepository.findById(id)))
    const byId = new Map<number, User>()
    users.forEach((u) => {
      if (u) byId.set(u.id, u)
    })
    return effects
      .filter((e) => byId.has(e.ownerId))
      .map((e) => toDerivative(e, toPublicUser(byId.get(e.ownerId)!)))
  },
}
