import { AppDataSource } from '@/server/database/data-source'
import { Effect } from '@/server/database/entities/effect.entity'

const repo = () => AppDataSource.getRepository(Effect)

export const EffectRepository = {
  findAllByOwner: (ownerId: number) =>
    repo().find({ where: { ownerId }, order: { createdAt: 'DESC' } }),
  findById: (id: number) => repo().findOneBy({ id }),
  findByIdOwned: (id: number, ownerId: number) => repo().findOneBy({ id, ownerId }),
  findBySlug: (slug: string) => repo().findOneBy({ slug }),
  create: (data: Pick<Effect, 'ownerId' | 'slug' | 'name'>) =>
    repo().save(repo().create(data)),
  update: (
    id: number,
    data: Partial<Pick<Effect, 'name' | 'slug' | 'draftVersionId' | 'stagingVersionId' | 'publishedVersionId'>>,
  ) => repo().update(id, { ...data, updatedAt: new Date() }),
  delete: (id: number) => repo().delete({ id }),
}
