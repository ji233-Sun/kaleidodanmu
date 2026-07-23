import { AppDataSource } from '@/server/database/data-source'
import { Draft } from '@/server/database/entities/draft.entity'

const repo = () => AppDataSource.getRepository(Draft)

export const DraftRepository = {
  findByEffectOwned: (effectId: number, ownerId: number) =>
    repo().findOne({ where: { effectId, ownerId }, order: { updatedAt: 'DESC' } }),
  /** 按 (effectId, ownerId) 插入或更新快照。 */
  upsert: async (data: {
    effectId: number
    ownerId: number
    snapshotJson: string
  }): Promise<Draft> => {
    const existing = await repo().findOne({ where: { effectId: data.effectId, ownerId: data.ownerId } })
    if (existing) {
      await repo().update(existing.id, { snapshotJson: data.snapshotJson, updatedAt: new Date() })
      return (await repo().findOneBy({ id: existing.id }))!
    }
    return repo().save(repo().create(data))
  },
}
