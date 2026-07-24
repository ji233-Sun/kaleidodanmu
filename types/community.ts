import { z } from 'zod'

/** 公开用户（不含 email / 密码）。 */
export interface PublicUserDto {
  id: number
  name: string
  displayName: string
  avatarHue: string
  bio: string
  createdAt: string
}

/** 广场卡片 / 个人主页里的作品（已发布、公开）。 */
export interface SquareEffectDto {
  id: number
  slug: string
  name: string
  prompt: string
  recipe: Record<string, unknown>
  tags: string[]
  author: PublicUserDto
  likes: number
  uses: number
  remixes: number
  coins: number
  favorites: number
  createdAt: string
}

export interface SquareListResponse {
  items: SquareEffectDto[]
  total: number
}

/** 作品详情：广场卡片字段 + 二创来源 + 当前用户的互动状态。 */
export interface EffectDetailDto extends SquareEffectDto {
  forkedFrom: number | null
  interacted: { like: boolean; coin: boolean; favorite: boolean } | null
}

export interface DerivativeDto {
  id: number
  slug: string
  name: string
  author: PublicUserDto
  likes: number
  createdAt: string
}

export interface DerivativeListResponse {
  items: DerivativeDto[]
}

export interface UserProfileDto {
  user: PublicUserDto
  effects: SquareEffectDto[]
  totalLikes: number
  totalCoins: number
  totalFavorites: number
  totalRemixes: number
  followers: number
  following: number
  isFollowing: boolean
}

export type InteractionKind = 'like' | 'coin' | 'favorite'

export const InteractionSchema = z.object({
  kind: z.enum(['like', 'coin', 'favorite']),
  on: z.boolean(),
})
export type InteractionRequest = z.infer<typeof InteractionSchema>

export interface InteractionResponse {
  kind: InteractionKind
  on: boolean
  count: number
}

export const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(32).optional(),
  avatarHue: z.string().min(1).max(32).optional(),
  bio: z.string().max(280).optional(),
})
export type UpdateProfileRequest = z.infer<typeof UpdateProfileSchema>

export const FollowSchema = z.object({ on: z.boolean() })
export type FollowRequest = z.infer<typeof FollowSchema>

export interface FollowResponse {
  on: boolean
  followersCount: number
}

/** 「我的点赞 / 收藏」作品列表。 */
export interface ReactionListResponse {
  items: SquareEffectDto[]
}

/** 粉丝 / 关注的用户列表。 */
export interface FollowListResponse {
  items: PublicUserDto[]
}
