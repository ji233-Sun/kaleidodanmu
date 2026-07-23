import { getRepo } from '@/server/database/data-source'
import type { Session } from '@/server/database/entities/session.entity'

// 懒初始化连接并按表名取 Repository（见 data-source.ts 注释）
const repo = () => getRepo<Session>('sessions')

export const SessionRepository = {
  findByToken: async (id: string) => (await repo()).findOneBy({ id }),
  create: async (data: Pick<Session, 'id' | 'userId' | 'expiresAt'>) =>
    (await repo()).save((await repo()).create(data)),
  delete: async (id: string) => (await repo()).delete({ id }),
}
