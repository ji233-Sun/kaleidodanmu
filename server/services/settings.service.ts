import { AppSettingRepository } from '@/server/repositories/appSetting.repository'
import type { AppSettingDto } from '@/types'
import type { AppSetting } from '@/server/database/entities/appSetting.entity'

export function toSettingDto(s: AppSetting): AppSettingDto {
  return { key: s.key, value: s.value }
}

export const SettingsService = {
  async list() {
    const rows = await AppSettingRepository.findAll()
    return rows.map(toSettingDto)
  },

  async get(key: string) {
    const row = await AppSettingRepository.findByKey(key)
    return row ? toSettingDto(row) : null
  },

  async set(key: string, value: string) {
    return toSettingDto(await AppSettingRepository.upsert(key, value))
  },
}
