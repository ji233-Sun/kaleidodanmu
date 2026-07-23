import { z } from 'zod'

export interface EffectVersionDto {
  id: number
  effectId: number
  version: string
  sha256: string
  entry: string
  sizeBytes: number
  sdkVersion: string
  schemaVersion: string
  storageKey: string
  createdBy: number
  createdAt: string
}

export const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/

/** 创建版本（上传表现包）：code 为入口 ES Module 的 base64。 */
export const CreateVersionSchema = z.object({
  version: z.string().regex(SEMVER_REGEX),
  entry: z.string().min(1),
  sdkVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  manifestJson: z.string(),
  code: z.string(),
  channel: z.enum(['draft', 'staging', 'published']).optional(),
})
export type CreateVersionRequest = z.infer<typeof CreateVersionSchema>

export interface VersionListResponse {
  versions: EffectVersionDto[]
}
