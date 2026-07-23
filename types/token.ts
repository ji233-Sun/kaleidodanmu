import { z } from 'zod'

export interface ApiTokenDto {
  id: number
  userId: number
  scopes: string[]
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

/** 仅在创建时返回一次的明文令牌（之后只存哈希）。 */
export interface CreatedApiTokenDto extends ApiTokenDto {
  token: string
}

export const CreateTokenSchema = z.object({
  scopes: z.array(z.string()).default([]),
  expiresInDays: z.number().int().positive().max(365).optional(),
})
export type CreateTokenRequest = z.infer<typeof CreateTokenSchema>

export interface TokenListResponse {
  tokens: ApiTokenDto[]
}
