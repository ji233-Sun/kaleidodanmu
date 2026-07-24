import { getRepo } from '@/server/database/data-source'
import type { EffectVersion } from '@/server/database/entities/effectVersion.entity'

// 懒初始化连接并按表名取 Repository（见 data-source.ts 注释）
const repo = () => getRepo<EffectVersion>('effect_versions')

export const EffectVersionRepository = {
  findAllByEffect: async (effectId: number) =>
    (await repo()).find({ where: { effectId }, order: { createdAt: 'DESC' } }),
  findById: async (id: number) => (await repo()).findOneBy({ id }),
  findByEffectAndVersion: async (effectId: number, version: string) =>
    (await repo()).findOneBy({ effectId, version }),
  // assetsJson 可空（单文件包为 null），create 时可省略
  create: async (
    data: Omit<EffectVersion, 'id' | 'createdAt' | 'assetsJson'> & { assetsJson?: string | null },
  ) => (await repo()).save((await repo()).create(data)),
}
