import { z } from 'zod'

/**
 * Effect Package 的共享契约：Manifest（effect.json）、版本常量与资源限额。
 * CLI（校验/构建/上传）、服务端（版本校验/存储）与网页 ADE（导出）共用同一份定义，避免漂移。
 */

/** 语义化版本号（含预发布），供 Manifest 与版本上传共用。 */
export const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/

/** Manifest 结构版本：从 "1"（new Function 源码）升到 "2"（真 ESM 加载）。 */
export const SCHEMA_VERSION = '2'

/** 当前 @kaleido/sdk 契约版本。 */
export const SDK_VERSION = '0.1.0'

/** 资源与体积限额（服务端与 CLI 共同强制）。 */
export const LIMITS = {
  /** 入口 ESM 上限：1MB。 */
  maxEntryBytes: 1_000_000,
  /** 单个静态资源上限：5MB。 */
  maxAssetBytes: 5_000_000,
  /** 包总体积上限：8MB。 */
  maxTotalBytes: 8_000_000,
  /** 静态资源数量上限。 */
  maxAssets: 32,
  /** 允许的资源 MIME 白名单。 */
  allowedAssetMime: [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'audio/mpeg',
    'audio/ogg',
    'application/json',
  ],
} as const

/** 包内相对路径：仅限字母数字与 . _ - /，禁止绝对路径与 .. 穿越。 */
export const SafePathSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9._\-/]+$/, '路径仅允许字母、数字与 . _ - /')
  .refine((p) => !p.startsWith('/') && !p.split('/').includes('..'), '路径不允许绝对路径或 .. 穿越')

const HexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/)

/** 兼容配方：现有存储与播放器的声明式基础参数（与 @kaleido/sdk 的 Recipe 接口对应）。 */
export const RecipeSchema = z
  .object({
    symmetry: z.number().int().min(3).max(12),
    rotationSpeed: z.number().min(-0.6).max(0.6),
    motion: z.enum(['spiral', 'burst', 'orbit', 'flow']),
    palette: z.array(HexColorSchema).min(2).max(6),
    shardScale: z.number().min(0.5).max(2),
    trail: z.number().min(0).max(0.9),
    density: z.number().min(0.3).max(2),
  })
  .strict()

/** Effect 能力声明。 */
export const CapabilitySchema = z.enum(['canvas', 'danmaku', 'pointer', 'three', 'gsap'])

/** Manifest 中的资源清单项（已计算 sha256 与体积）。 */
export const AssetSchema = z
  .object({
    path: SafePathSchema,
    mime: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    sizeBytes: z.number().int().nonnegative().max(LIMITS.maxAssetBytes),
  })
  .strict()
export type AssetDescriptor = z.infer<typeof AssetSchema>

/** 完整 Manifest（effect.json）。build 会补全 assets 的 sha256/size。 */
export const EffectManifestSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    sdkVersion: z.string().min(1),
    version: z.string().regex(SEMVER_REGEX),
    name: z.string().trim().min(1).max(64),
    entry: SafePathSchema,
    recipe: RecipeSchema,
    capabilities: z.array(CapabilitySchema).default([]),
    assets: z.array(AssetSchema).max(LIMITS.maxAssets).default([]),
  })
  .strict()
export type EffectManifest = z.infer<typeof EffectManifestSchema>

/** 版本上传时随包携带的资源（base64 字节，服务端落盘并计算 sha256）。 */
export const AssetUploadSchema = z
  .object({
    path: SafePathSchema,
    mime: z.string().min(1),
    data: z.string(), // base64
  })
  .strict()
export type AssetUpload = z.infer<typeof AssetUploadSchema>
