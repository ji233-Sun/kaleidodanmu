import { getRepo } from '@/server/database/data-source'
import type { EffectLike } from '@/server/database/entities/effectLike.entity'

const repo = () => getRepo<EffectLike>('effect_likes')

export const EffectLikeRepository = {
  exists: async (userId: number, effectId: number): Promise<boolean> =>
    !!(await (await repo()).findOneBy({ userId, effectId })),
  add: async (data: { userId: number; effectId: number }) =>
    (await repo()).save((await repo()).create(data)),
  remove: async (userId: number, effectId: number) => {
    await (await repo()).delete({ userId, effectId })
  },
  findEffectIdsByUser: async (userId: number): Promise<number[]> =>
    (await repo())
      .find({ where: { userId }, select: { effectId: true } })
      .then((rs) => rs.map((r) => r.effectId)),
}
