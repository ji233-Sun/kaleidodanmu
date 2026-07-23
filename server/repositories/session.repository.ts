import { AppDataSource } from '@/server/database/data-source'
import { Session } from '@/server/database/entities/session.entity'

const repo = () => AppDataSource.getRepository(Session)

export const SessionRepository = {
  findByToken: (id: string) => repo().findOneBy({ id }),
  create: (data: Pick<Session, 'id' | 'userId' | 'expiresAt'>) =>
    repo().save(repo().create(data)),
  delete: (id: string) => repo().delete({ id }),
}
