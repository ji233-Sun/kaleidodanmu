import { getRepo } from '@/server/database/data-source'
import type { UserFollow } from '@/server/database/entities/userFollow.entity'

const repo = () => getRepo<UserFollow>('user_follows')

export const UserFollowRepository = {
  exists: async (followerId: number, followeeId: number): Promise<boolean> =>
    !!(await (await repo()).findOneBy({ followerId, followeeId })),
  add: async (data: { followerId: number; followeeId: number }) =>
    (await repo()).save((await repo()).create(data)),
  remove: async (followerId: number, followeeId: number) => {
    await (await repo()).delete({ followerId, followeeId })
  },
  findFolloweeIds: async (followerId: number): Promise<number[]> =>
    (await repo())
      .find({ where: { followerId }, select: { followeeId: true } })
      .then((rs) => rs.map((r) => r.followeeId)),
  findFollowerIds: async (followeeId: number): Promise<number[]> =>
    (await repo())
      .find({ where: { followeeId }, select: { followerId: true } })
      .then((rs) => rs.map((r) => r.followerId)),
}
