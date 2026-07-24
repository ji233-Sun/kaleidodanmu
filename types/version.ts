import { z } from 'zod'
import { AssetUploadSchema, LIMITS, SEMVER_REGEX } from './manifest'

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

/** 创建版本（上传表现包）：code 为入口 ES Module 的 base64，assets 为随包静态资源。 */
export const CreateVersionSchema = z.object({
  version: z.string().regex(SEMVER_REGEX),
  entry: z.string().min(1),
  sdkVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  manifestJson: z.string(),
  code: z.string(),
  assets: z.array(AssetUploadSchema).max(LIMITS.maxAssets).default([]),
  channel: z.enum(['draft', 'staging', 'published']).optional(),
})
// 用 input 类型：assets 有默认值、channel 可选，构造请求时无需显式提供（服务端 parse 后补全）。
export type CreateVersionRequest = z.input<typeof CreateVersionSchema>

export interface VersionListResponse {
  versions: EffectVersionDto[]
}

/** 版本产物中的单个文件（入口或资源），data 为 base64。 */
export interface VersionFilePayload {
  path: string
  mime: string
  data: string
}

/** 存储在库中的资源清单项（写入 assets_json）。 */
export interface StoredAsset {
  path: string
  mime: string
  sha256: string
  sizeBytes: number
  storageKey: string
}

/** 读取某版本完整产物：入口模块 + 静态资源，供运行时加载。 */
export interface VersionArtifactResponse {
  version: EffectVersionDto
  manifestJson: string
  entry: VersionFilePayload
  assets: VersionFilePayload[]
}
