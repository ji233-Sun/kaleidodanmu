import { AppDataSource } from '@/server/database/data-source'
import { Effect } from '@/server/database/entities/effect.entity'

/**
 * Effect 数据访问封装：所有对 effects 表的读写都经过这里，
 * Route / Service 不直接碰 AppDataSource.getRepository。
 */
const repo = () => AppDataSource.getRepository(Effect)

export const EffectRepository = {
  findAll: () => repo().find({ order: { createdAt: 'DESC' } }),
  findById: (id: number) => repo().findOneBy({ id }),
  findBySlug: (slug: string) => repo().findOneBy({ slug }),
  create: (data: Pick<Effect, 'ownerId' | 'slug' | 'name'>) =>
    repo().save(repo().create(data)),
}
