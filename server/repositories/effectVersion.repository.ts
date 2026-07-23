import { AppDataSource } from '@/server/database/data-source'
import { EffectVersion } from '@/server/database/entities/effectVersion.entity'

const repo = () => AppDataSource.getRepository(EffectVersion)

export const EffectVersionRepository = {
  findAllByEffect: (effectId: number) =>
    repo().find({ where: { effectId }, order: { createdAt: 'DESC' } }),
  findById: (id: number) => repo().findOneBy({ id }),
  findByEffectAndVersion: (effectId: number, version: string) =>
    repo().findOneBy({ effectId, version }),
  create: (data: Omit<EffectVersion, 'id' | 'createdAt'>) =>
    repo().save(repo().create(data)),
}
