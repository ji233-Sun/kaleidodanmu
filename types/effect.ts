import { z } from 'zod'

export interface EffectDto {
  id: number
  ownerId: number
  slug: string
  name: string
  forkedFrom: number | null
  visibility: 'private' | 'public'
  prompt: string
  recipe: Record<string, unknown>
  tags: string[]
  likes: number
  uses: number
  remixes: number
  coins: number
  favorites: number
  draftVersionId: number | null
  stagingVersionId: number | null
  publishedVersionId: number | null
  createdAt: string
  updatedAt: string
}

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/

export type EffectChannel = 'draft' | 'staging' | 'published'

export const CreateEffectSchema = z.object({
  slug: z.string().min(1).max(64).regex(SLUG_REGEX),
  name: z.string().min(1).max(128),
  prompt: z.string().max(1000).optional(),
  recipe: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(['private', 'public']).optional(),
  forkedFrom: z.number().int().positive().optional(),
})
export type CreateEffectRequest = z.infer<typeof CreateEffectSchema>

export const UpdateEffectSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  slug: z.string().min(1).max(64).regex(SLUG_REGEX).optional(),
  prompt: z.string().max(1000).optional(),
  recipe: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(['private', 'public']).optional(),
})
export type UpdateEffectRequest = z.infer<typeof UpdateEffectSchema>

export const PublishEffectSchema = z.object({
  versionId: z.number().int().positive(),
  channel: z.enum(['draft', 'staging', 'published']),
})
export type PublishEffectRequest = z.infer<typeof PublishEffectSchema>

export interface EffectListResponse {
  effects: EffectDto[]
}
