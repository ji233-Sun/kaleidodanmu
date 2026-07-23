import { getRepo } from '@/server/database/data-source'
import type { ApiToken } from '@/server/database/entities/apiToken.entity'

// 懒初始化连接并按表名取 Repository（见 data-source.ts 注释）
const repo = () => getRepo<ApiToken>('api_tokens')

export const ApiTokenRepository = {
  findAllByUser: async (userId: number) =>
    (await repo()).find({ where: { userId }, order: { createdAt: 'DESC' } }),
  findByTokenHash: async (tokenHash: string) => (await repo()).findOneBy({ tokenHash }),
  create: async (data: Pick<ApiToken, 'userId' | 'tokenHash' | 'scopes' | 'expiresAt'>) =>
    (await repo()).save((await repo()).create(data)),
  revoke: async (id: number, userId: number) =>
    (await repo()).update({ id, userId }, { revokedAt: new Date() }),
}
