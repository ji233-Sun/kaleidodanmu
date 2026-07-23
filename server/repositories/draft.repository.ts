import { getRepo } from '@/server/database/data-source'
import type { Draft } from '@/server/database/entities/draft.entity'

// 懒初始化连接并按表名取 Repository（见 data-source.ts 注释）
const repo = () => getRepo<Draft>('drafts')

export const DraftRepository = {
  findByEffectOwned: async (effectId: number, ownerId: number) =>
    (await repo()).findOne({ where: { effectId, ownerId }, order: { updatedAt: 'DESC' } }),
  /** 按 (effectId, ownerId) 插入或更新快照。 */
  upsert: async (data: {
    effectId: number
    ownerId: number
    snapshotJson: string
  }): Promise<Draft> => {
    const existing = await (
      await repo()
    ).findOne({ where: { effectId: data.effectId, ownerId: data.ownerId } })
    if (existing) {
      await (await repo()).update(existing.id, { snapshotJson: data.snapshotJson, updatedAt: new Date() })
      return (await (await repo()).findOneBy({ id: existing.id }))!
    }
    return (await repo()).save((await repo()).create(data))
  },
}
