import { getRepo } from '@/server/database/data-source'
import type { AppSetting } from '@/server/database/entities/appSetting.entity'

// 懒初始化连接并按表名取 Repository（见 data-source.ts 注释）
const repo = () => getRepo<AppSetting>('app_settings')

export const AppSettingRepository = {
  findAll: async () => (await repo()).find({ order: { key: 'ASC' } }),
  findByKey: async (key: string) => (await repo()).findOneBy({ key }),
  /** 按 key 插入或更新。 */
  upsert: async (key: string, value: string): Promise<AppSetting> => {
    const existing = await (await repo()).findOneBy({ key })
    if (existing) {
      await (await repo()).update({ key }, { value })
      return (await (await repo()).findOneBy({ key }))!
    }
    return (await repo()).save((await repo()).create({ key, value }))
  },
}
