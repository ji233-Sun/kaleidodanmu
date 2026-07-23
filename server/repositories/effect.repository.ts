import { getRepo } from '@/server/database/data-source'
import type { Effect } from '@/server/database/entities/effect.entity'

const repo = () => getRepo<Effect>('effects')

export type EffectCountColumn = 'likes' | 'uses' | 'remixes' | 'coins' | 'favorites'

export const EffectRepository = {
  findAllByOwner: async (ownerId: number) =>
    (await repo()).find({ where: { ownerId }, order: { createdAt: 'DESC' } }),
  findById: async (id: number) => (await repo()).findOneBy({ id }),
  findByIdOwned: async (id: number, ownerId: number) =>
    (await repo()).findOneBy({ id, ownerId }),
  findBySlug: async (slug: string) => (await repo()).findOneBy({ slug }),

  /** 广场：已发布（publishedVersionId 非空）且公开，分页。 */
  findSquarePage: async (limit: number, offset: number): Promise<[Effect[], number]> =>
    (await repo())
      .createQueryBuilder('e')
      .where('e.visibility = :v', { v: 'public' })
      .andWhere('e.publishedVersionId IS NOT NULL')
      .orderBy('e.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount(),

  /** 单个广场作品（已发布 + 公开）。 */
  findSquareById: async (id: number) =>
    (await repo())
      .createQueryBuilder('e')
      .where('e.id = :id', { id })
      .andWhere('e.visibility = :v', { v: 'public' })
      .andWhere('e.publishedVersionId IS NOT NULL')
      .getOne(),

  /** 某用户已发布且公开的作品（个人主页）。 */
  findPublishedByOwner: async (ownerId: number) =>
    (await repo())
      .createQueryBuilder('e')
      .where('e.ownerId = :ownerId', { ownerId })
      .andWhere('e.visibility = :v', { v: 'public' })
      .andWhere('e.publishedVersionId IS NOT NULL')
      .orderBy('e.createdAt', 'DESC')
      .getMany(),

  findDerivatives: async (parentId: number, limit: number) =>
    (await repo()).find({
      where: { forkedFrom: parentId },
      order: { createdAt: 'DESC' },
      take: limit,
    }),

  create: async (data: {
    ownerId: number
    slug: string
    name: string
    prompt?: string
    recipeJson?: string
    tagsJson?: string
    visibility?: string
    forkedFrom?: number | null
  }) =>
    (await repo()).save(
      (await repo()).create({
        ownerId: data.ownerId,
        slug: data.slug,
        name: data.name,
        prompt: data.prompt ?? '',
        recipeJson: data.recipeJson ?? '{}',
        tagsJson: data.tagsJson ?? '[]',
        visibility: data.visibility ?? 'private',
        forkedFrom: data.forkedFrom ?? null,
      }),
    ),

  update: async (
    id: number,
    data: Partial<
      Pick<
        Effect,
        | 'name'
        | 'slug'
        | 'prompt'
        | 'visibility'
        | 'recipeJson'
        | 'tagsJson'
        | 'draftVersionId'
        | 'stagingVersionId'
        | 'publishedVersionId'
      >
    >,
  ) => (await repo()).update(id, { ...data, updatedAt: new Date() }),

  bumpCount: async (id: number, column: EffectCountColumn, delta: 1 | -1) =>
    delta > 0
      ? (await repo()).increment({ id }, column, delta)
      : (await repo()).decrement({ id }, column, -delta),

  delete: async (id: number) => {
    await (await repo()).delete({ id })
  },
}
