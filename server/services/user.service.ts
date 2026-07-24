import { HttpError } from '@/server/utils/errors'
import { UserRepository } from '@/server/repositories/user.repository'
import { EffectRepository } from '@/server/repositories/effect.repository'
import { toPublicUser, toSquareEffect, sum } from './community.mapper'
import type { UserProfileDto, UpdateProfileRequest, PublicUserDto } from '@/types'

export const UserService = {
  async getPublicUser(userId: number): Promise<PublicUserDto> {
    const user = await UserRepository.findById(userId)
    if (!user) throw new HttpError(404, 'not_found', 'User not found')
    return toPublicUser(user)
  },

  /** GET /api/users/:name —— 个人主页：资料 + 已发布作品 + 聚合统计。 */
  async getProfile(name: string): Promise<UserProfileDto | null> {
    const user = await UserRepository.findByName(name)
    if (!user) return null
    const effects = await EffectRepository.findPublishedByOwner(user.id)
    const items = effects.map((e) => toSquareEffect(e, toPublicUser(user)))
    return {
      user: toPublicUser(user),
      effects: items,
      totalLikes: sum(items, 'likes'),
      totalCoins: sum(items, 'coins'),
      totalFavorites: sum(items, 'favorites'),
      totalRemixes: sum(items, 'remixes'),
      followers: 0,
    }
  },

  /** PATCH /api/users/me —— 更新昵称 / 头像色 / 简介。 */
  async updateProfile(userId: number, input: UpdateProfileRequest): Promise<PublicUserDto> {
    await UserRepository.updateProfile(userId, input)
    const user = await UserRepository.findById(userId)
    if (!user) throw new HttpError(404, 'not_found', 'User not found')
    return toPublicUser(user)
  },
}
