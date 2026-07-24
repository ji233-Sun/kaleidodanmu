import { HttpError } from '@/server/utils/errors'
import { UserRepository } from '@/server/repositories/user.repository'
import { UserFollowRepository } from '@/server/repositories/userFollow.repository'
import { toPublicUser } from './community.mapper'
import type { PublicUserDto } from '@/types'

async function loadUsers(ids: number[]): Promise<PublicUserDto[]> {
  const users = await Promise.all(ids.map((id) => UserRepository.findById(id)))
  return users
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => toPublicUser(u))
}

async function mustFindByName(name: string) {
  const u = await UserRepository.findByName(name)
  if (!u) throw new HttpError(404, 'not_found', 'User not found')
  return u
}

export const FollowService = {
  /** 关注 / 取关；维护双方冗余计数；禁止自我关注。 */
  async toggle(
    followerId: number,
    followeeName: string,
    on: boolean,
  ): Promise<{ on: boolean; followersCount: number }> {
    const followee = await mustFindByName(followeeName)
    if (followee.id === followerId) {
      throw new HttpError(400, 'cannot_follow_self', 'Cannot follow yourself')
    }
    const exists = await UserFollowRepository.exists(followerId, followee.id)
    if (on && !exists) {
      await UserFollowRepository.add({ followerId, followeeId: followee.id })
      await UserRepository.bumpCount(followerId, 'followingCount', 1)
      await UserRepository.bumpCount(followee.id, 'followersCount', 1)
    } else if (!on && exists) {
      await UserFollowRepository.remove(followerId, followee.id)
      await UserRepository.bumpCount(followerId, 'followingCount', -1)
      await UserRepository.bumpCount(followee.id, 'followersCount', -1)
    }
    const refreshed = await UserRepository.findById(followee.id)
    return { on, followersCount: refreshed ? refreshed.followersCount : 0 }
  },

  isFollowing: (followerId: number | null, followeeId: number): Promise<boolean> =>
    followerId ? UserFollowRepository.exists(followerId, followeeId) : Promise.resolve(false),

  listFollowers: (followeeId: number): Promise<PublicUserDto[]> =>
    UserFollowRepository.findFollowerIds(followeeId).then(loadUsers),

  listFollowing: (followerId: number): Promise<PublicUserDto[]> =>
    UserFollowRepository.findFolloweeIds(followerId).then(loadUsers),

  listFollowersByName: (name: string): Promise<PublicUserDto[]> =>
    mustFindByName(name).then((u) => FollowService.listFollowers(u.id)),

  listFollowingByName: (name: string): Promise<PublicUserDto[]> =>
    mustFindByName(name).then((u) => FollowService.listFollowing(u.id)),
}
