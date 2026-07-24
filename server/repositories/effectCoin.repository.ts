import { getRepo } from '@/server/database/data-source'
import type { EffectCoin } from '@/server/database/entities/effectCoin.entity'

const repo = () => getRepo<EffectCoin>('effect_coins')

export const EffectCoinRepository = {
  exists: async (userId: number, effectId: number): Promise<boolean> =>
    !!(await (await repo()).findOneBy({ userId, effectId })),
  add: async (data: { userId: number; effectId: number }) =>
    (await repo()).save((await repo()).create(data)),
  findEffectIdsByUser: async (userId: number): Promise<number[]> =>
    (await repo())
      .find({ where: { userId }, select: { effectId: true } })
      .then((rs) => rs.map((r) => r.effectId)),
}
