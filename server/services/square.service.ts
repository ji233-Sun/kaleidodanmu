import { EffectRepository } from '@/server/repositories/effect.repository'
import { toSquareEffect, loadAuthorsMap } from './community.mapper'
import { InteractionService } from './interaction.service'
import type { SquareListResponse, SquareEffectDto, EffectDetailDto } from '@/types'
import type { Effect } from '@/server/database/entities/effect.entity'

async function withAuthors(effects: Effect[]): Promise<SquareEffectDto[]> {
  const authors = await loadAuthorsMap(effects)
  return effects
    .filter((e) => authors.has(e.ownerId))
    .map((e) => toSquareEffect(e, authors.get(e.ownerId)!))
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
    const authors = await loadAuthorsMap([effect])
    const author = authors.get(effect.ownerId)
    if (!author) return null
    const card = toSquareEffect(effect, author)
    const interacted = await InteractionService.userState(viewerId, id)
    return { ...card, forkedFrom: effect.forkedFrom, interacted }
  },
}
