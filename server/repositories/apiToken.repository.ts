import { AppDataSource } from '@/server/database/data-source'
import { ApiToken } from '@/server/database/entities/apiToken.entity'

const repo = () => AppDataSource.getRepository(ApiToken)

export const ApiTokenRepository = {
  findAllByUser: (userId: number) =>
    repo().find({ where: { userId }, order: { createdAt: 'DESC' } }),
  findByTokenHash: (tokenHash: string) => repo().findOneBy({ tokenHash }),
  create: (data: Pick<ApiToken, 'userId' | 'tokenHash' | 'scopes' | 'expiresAt'>) =>
    repo().save(repo().create(data)),
  revoke: (id: number, userId: number) =>
    repo().update({ id, userId }, { revokedAt: new Date() }),
}
