import { getRepo } from '@/server/database/data-source'
import type { EffectInteraction } from '@/server/database/entities/effectInteraction.entity'

const repo = () => getRepo<EffectInteraction>('effect_interactions')

export const InteractionRepository = {
  /** 当前用户对该作品的所有互动记录。 */
  findUserState: async (userId: number, effectId: number) =>
    (await repo()).find({ where: { userId, effectId } }),

  exists: async (userId: number, effectId: number, kind: string): Promise<boolean> => {
    const row = await (await repo()).findOneBy({ userId, effectId, kind })
    return !!row
  },

  add: async (data: { userId: number; effectId: number; kind: string }) =>
    (await repo()).save((await repo()).create(data)),

  remove: async (userId: number, effectId: number, kind: string) =>
    (await repo()).delete({ userId, effectId, kind }),
}
