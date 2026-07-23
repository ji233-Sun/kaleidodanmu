import { EffectRepository } from '@/server/repositories/effect.repository'
import { UserRepository } from '@/server/repositories/user.repository'
import { InteractionRepository } from '@/server/repositories/effectInteraction.repository'
import { toPublicUser, toSquareEffect } from './community.mapper'
import type { SquareListResponse, SquareEffectDto, EffectDetailDto } from '@/types'
import type { Effect } from '@/server/database/entities/effect.entity'
import type { User } from '@/server/database/entities/user.entity'

async function withAuthors(effects: Effect[]): Promise<SquareEffectDto[]> {
  const ownerIds = [...new Set(effects.map((e) => e.ownerId))]
  const users = await Promise.all(ownerIds.map((id) => UserRepository.findById(id)))
  const byId = new Map<number, User>()
  users.forEach((u) => {
    if (u) byId.set(u.id, u)
  })
  return effects
    .filter((e) => byId.has(e.ownerId))
    .map((e) => toSquareEffect(e, toPublicUser(byId.get(e.ownerId)!)))
}

export const SquareService = {
  /** GET /api/square —— 已发布且公开的作品，分页。 */
  async list(limit = 20, offset = 0): Promise<SquareListResponse> {
    const safeLimit = Math.min(Math.max(1, limit), 50)
    const safeOffset = Math.max(0, offset)
    const [effects, total] = await EffectRepository.findSquarePage(safeLimit, safeOffset)
    return { items: await withAuthors(effects), total }
  },

  /** GET /api/square/:id —— 单个作品详情（含当前用户互动状态）。 */
  async detail(id: number, viewerId: number | null): Promise<EffectDetailDto | null> {
    const effect = await EffectRepository.findSquareById(id)
    if (!effect) return null
    const author = await UserRepository.findById(effect.ownerId)
    if (!author) return null
    const card = toSquareEffect(effect, toPublicUser(author))
    let interacted: EffectDetailDto['interacted'] = null
    if (viewerId) {
      const rows = await InteractionRepository.findUserState(viewerId, id)
      const kinds = new Set(rows.map((r) => r.kind))
      interacted = {
        like: kinds.has('like'),
        coin: kinds.has('coin'),
        favorite: kinds.has('favorite'),
      }
    }
    return { ...card, forkedFrom: effect.forkedFrom, interacted }
  },
}
