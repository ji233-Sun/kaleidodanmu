import { AppDataSource } from '@/server/database/data-source'
import { User } from '@/server/database/entities/user.entity'

const repo = () => AppDataSource.getRepository(User)

export const UserRepository = {
  findById: (id: number) => repo().findOneBy({ id }),
  findByEmail: (email: string) => repo().findOneBy({ email }),
  create: (data: Pick<User, 'email' | 'passwordHash'>) =>
    repo().save(repo().create({ ...data, role: 'creator' })),
}
