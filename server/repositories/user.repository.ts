import { getRepo } from '@/server/database/data-source'
import type { User } from '@/server/database/entities/user.entity'

// 懒初始化连接并按表名取 Repository（见 data-source.ts 注释）
const repo = () => getRepo<User>('users')

export const UserRepository = {
  findById: async (id: number) => (await repo()).findOneBy({ id }),
  findByEmail: async (email: string) => (await repo()).findOneBy({ email }),
  create: async (data: Pick<User, 'email' | 'passwordHash'>) =>
    (await repo()).save((await repo()).create({ ...data, role: 'creator' })),
}
