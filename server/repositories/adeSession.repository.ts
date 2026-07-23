import { getRepo } from '@/server/database/data-source'
import type { AdeSession } from '@/server/database/entities/adeSession.entity'

const repo = () => getRepo<AdeSession>('ade_sessions')

export const AdeSessionRepository = {
  findOwned: async (ownerId: number, targetKey: string) =>
    (await repo()).findOne({ where: { ownerId, targetKey } }),

  /** 按 (ownerId, targetKey) upsert 聊天快照。 */
  upsert: async (data: {
    ownerId: number
    targetKey: string
    payloadJson: string
  }): Promise<AdeSession> => {
    const r = await repo()
    const existing = await r.findOne({ where: { ownerId: data.ownerId, targetKey: data.targetKey } })
    if (existing) {
      await r.update(existing.id, { payloadJson: data.payloadJson, updatedAt: new Date() })
      return (await r.findOneBy({ id: existing.id }))!
    }
    return r.save(r.create(data))
  },
}
