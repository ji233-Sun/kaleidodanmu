import { z } from 'zod'

export interface AppSettingDto {
  key: string
  value: string
}

export const UpdateSettingSchema = z.object({
  value: z.string(),
})
export type UpdateSettingRequest = z.infer<typeof UpdateSettingSchema>
