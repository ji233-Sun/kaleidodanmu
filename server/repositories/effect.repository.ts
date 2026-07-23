import { getRepo } from '@/server/database/data-source'
import type { Effect } from '@/server/database/entities/effect.entity'

// 懒初始化连接并按表名取 Repository（见 data-source.ts 注释）
const repo = () => getRepo<Effect>('effects')

export const EffectRepository = {
  findAllByOwner: async (ownerId: number) =>
    (await repo()).find({ where: { ownerId }, order: { createdAt: 'DESC' } }),
  findById: async (id: number) => (await repo()).findOneBy({ id }),
  findByIdOwned: async (id: number, ownerId: number) => (await repo()).findOneBy({ id, ownerId }),
  findBySlug: async (slug: string) => (await repo()).findOneBy({ slug }),
  create: async (data: Pick<Effect, 'ownerId' | 'slug' | 'name'>) =>
    (await repo()).save((await repo()).create(data)),
  update: async (
    id: number,
    data: Partial<Pick<Effect, 'name' | 'slug' | 'draftVersionId' | 'stagingVersionId' | 'publishedVersionId'>>,
  ) => (await repo()).update(id, { ...data, updatedAt: new Date() }),
  delete: async (id: number) => (await repo()).delete({ id }),
}
