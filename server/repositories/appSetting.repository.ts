import { AppDataSource } from '@/server/database/data-source'
import { AppSetting } from '@/server/database/entities/appSetting.entity'

const repo = () => AppDataSource.getRepository(AppSetting)

export const AppSettingRepository = {
  findAll: () => repo().find({ order: { key: 'ASC' } }),
  findByKey: (key: string) => repo().findOneBy({ key }),
  /** 按 key 插入或更新。 */
  upsert: async (key: string, value: string): Promise<AppSetting> => {
    const existing = await repo().findOneBy({ key })
    if (existing) {
      await repo().update({ key }, { value })
      return (await repo().findOneBy({ key }))!
    }
    return repo().save(repo().create({ key, value }))
  },
}
