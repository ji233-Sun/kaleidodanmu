import { describe, beforeAll, afterAll, it, expect } from 'vitest'
import { useBackend, uniq, type Backend } from './helpers/backend'
import type { User } from '@/server/database/entities/user.entity'

/**
 * 个人关系拆分表（effect_likes / effect_favorites / effect_coins / user_follows）
 * 与 follow / 我的列表 / profile 关注关系的测试。
 */
describe('community: reactions & follows（拆分表）', () => {
  let b: Backend
  beforeAll(async () => {
    b = await useBackend()
  })
  afterAll(async () => {
    await b.cleanup()
  })

  // AuthUserDto 不含 name，这里取回完整 User 以拿到 handle。
  async function makeUser(): Promise<User> {
    const { user } = await b.AuthService.register(`${uniq('u')}@test.local`, '12345678')
    const full = await b.UserRepository.findById(user.id)
    if (!full) throw new Error('user not found after register')
    return full
  }

  // 创建一个已发布 + 公开的作品（用于互动）。
  async function makePublicEffect(ownerId: number) {
    const e = await b.EffectService.create({
      ownerId,
      slug: uniq('fx'),
      name: 'N',
      visibility: 'public',
      prompt: 'p',
      recipe: { symmetry: 4 },
    })
    const v = await b.VersionService.create(e.id, ownerId, {
      version: '1.0.0',
      entry: 'main.js',
      sdkVersion: '0.1',
      schemaVersion: '1',
      manifestJson: '{}',
      code: 'YQ==',
      assets: [],
    })
    await b.EffectService.publish(e.id, ownerId, v.id, 'published')
    return e
  }

  describe('InteractionService — 点赞/收藏/投币 走独立表', () => {
    it('like 写入 effect_likes 并自增 likes；取消则自减', async () => {
      const owner = await makeUser()
      const viewer = await makeUser()
      const e = await makePublicEffect(owner.id)

      const r1 = await b.InteractionService.toggle(viewer.id, e.id, 'like', true)
      expect(r1).toMatchObject({ kind: 'like', on: true, count: 1 })
      expect(await b.EffectLikeRepository.exists(viewer.id, e.id)).toBe(true)

      const r2 = await b.InteractionService.toggle(viewer.id, e.id, 'like', false)
      expect(r2.count).toBe(0)
      expect(await b.EffectLikeRepository.exists(viewer.id, e.id)).toBe(false)
    })

    it('favorite 写入 effect_favorites，与 like 分属不同表', async () => {
      const owner = await makeUser()
      const viewer = await makeUser()
      const e = await makePublicEffect(owner.id)

      await b.InteractionService.toggle(viewer.id, e.id, 'favorite', true)
      expect(await b.EffectFavoriteRepository.exists(viewer.id, e.id)).toBe(true)
      expect(await b.EffectLikeRepository.exists(viewer.id, e.id)).toBe(false)

      const got = await b.EffectService.get(e.id, owner.id)
      expect(got.favorites).toBe(1)
      expect(got.likes).toBe(0)
    })

    it('coin 单向：写入 effect_coins；on=false 不会撤销', async () => {
      const owner = await makeUser()
      const viewer = await makeUser()
      const e = await makePublicEffect(owner.id)

      const r1 = await b.InteractionService.toggle(viewer.id, e.id, 'coin', true)
      expect(r1.count).toBe(1)
      expect(await b.EffectCoinRepository.exists(viewer.id, e.id)).toBe(true)

      // 投币不可撤销（coin 仓储无 remove）
      const r2 = await b.InteractionService.toggle(viewer.id, e.id, 'coin', false)
      expect(r2.count).toBe(1)
      expect(await b.EffectCoinRepository.exists(viewer.id, e.id)).toBe(true)
    })

    it('重复 toggle 同一 kind 幂等，不重复计数', async () => {
      const owner = await makeUser()
      const viewer = await makeUser()
      const e = await makePublicEffect(owner.id)

      await b.InteractionService.toggle(viewer.id, e.id, 'like', true)
      const r = await b.InteractionService.toggle(viewer.id, e.id, 'like', true)
      expect(r.count).toBe(1)
    })

    it('userState 返回当前用户三种互动状态；匿名返回 null', async () => {
      const owner = await makeUser()
      const viewer = await makeUser()
      const e = await makePublicEffect(owner.id)

      await b.InteractionService.toggle(viewer.id, e.id, 'like', true)
      await b.InteractionService.toggle(viewer.id, e.id, 'favorite', true)

      expect(await b.InteractionService.userState(viewer.id, e.id)).toEqual({
        like: true,
        coin: false,
        favorite: true,
      })
      expect(await b.InteractionService.userState(null, e.id)).toBe(null)
    })

    it('listMine 返回我的点赞 / 收藏作品，且与他人隔离', async () => {
      const owner = await makeUser()
      const viewer = await makeUser()
      const e = await makePublicEffect(owner.id)

      await b.InteractionService.toggle(viewer.id, e.id, 'like', true)
      await b.InteractionService.toggle(viewer.id, e.id, 'favorite', true)

      const likes = await b.InteractionService.listMine(viewer.id, 'like')
      const favs = await b.InteractionService.listMine(viewer.id, 'favorite')
      expect(likes.map((x) => x.id)).toContain(e.id)
      expect(favs.map((x) => x.id)).toContain(e.id)

      const other = await makeUser()
      expect((await b.InteractionService.listMine(other.id, 'favorite')).length).toBe(0)
    })

    it('未发布/私有作品不能互动（404）', async () => {
      const owner = await makeUser()
      const viewer = await makeUser()
      const e = await b.EffectService.create({ ownerId: owner.id, slug: uniq('priv'), name: 'N' })
      await expect(
        b.InteractionService.toggle(viewer.id, e.id, 'like', true),
      ).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('FollowService — 关注关系（user_follows）', () => {
    it('follow 写入关系并维护双方计数；unfollow 撤销', async () => {
      const a = await makeUser()
      const c = await makeUser()

      const r = await b.FollowService.toggle(c.id, a.name, true)
      expect(r).toMatchObject({ on: true, followersCount: 1 })
      expect(await b.UserFollowRepository.exists(c.id, a.id)).toBe(true)
      expect((await b.UserRepository.findById(a.id))?.followersCount).toBe(1)
      expect((await b.UserRepository.findById(c.id))?.followingCount).toBe(1)

      const r2 = await b.FollowService.toggle(c.id, a.name, false)
      expect(r2.on).toBe(false)
      expect(await b.UserFollowRepository.exists(c.id, a.id)).toBe(false)
      expect((await b.UserRepository.findById(a.id))?.followersCount).toBe(0)
      expect((await b.UserRepository.findById(c.id))?.followingCount).toBe(0)
    })

    it('isFollowing 反映关系；重复 follow 幂等不重复计数', async () => {
      const a = await makeUser()
      const c = await makeUser()

      expect(await b.FollowService.isFollowing(c.id, a.id)).toBe(false)
      await b.FollowService.toggle(c.id, a.name, true)
      await b.FollowService.toggle(c.id, a.name, true)
      expect(await b.FollowService.isFollowing(c.id, a.id)).toBe(true)
      expect((await b.UserRepository.findById(c.id))?.followingCount).toBe(1)
    })

    it('自我关注抛 400 cannot_follow_self', async () => {
      const a = await makeUser()
      await expect(b.FollowService.toggle(a.id, a.name, true)).rejects.toMatchObject({
        status: 400,
        code: 'cannot_follow_self',
      })
    })

    it('关注不存在的人抛 404', async () => {
      const c = await makeUser()
      await expect(b.FollowService.toggle(c.id, `nobody-${uniq('x')}`, true)).rejects.toMatchObject({
        status: 404,
      })
    })

    it('listFollowers / listFollowing 返回对应用户', async () => {
      const a = await makeUser()
      const c1 = await makeUser()
      const c2 = await makeUser()
      await b.FollowService.toggle(c1.id, a.name, true)
      await b.FollowService.toggle(c2.id, a.name, true)
      await b.FollowService.toggle(a.id, c1.name, true) // a 关注 c1

      const followers = await b.FollowService.listFollowers(a.id)
      expect(followers.map((u) => u.id).sort()).toEqual([c1.id, c2.id])
      const following = await b.FollowService.listFollowing(a.id)
      expect(following.map((u) => u.id)).toEqual([c1.id])
    })
  })

  describe('UserService.getProfile — 关注关系字段', () => {
    it('profile 含 followers/following/isFollowing，随关注变化；匿名视角计数可见但 isFollowing=false', async () => {
      const a = await makeUser()
      const c = await makeUser()

      const p0 = await b.UserService.getProfile(a.name, c.id)
      expect(p0?.isFollowing).toBe(false)
      expect(p0?.followers).toBe(0)

      await b.FollowService.toggle(c.id, a.name, true)
      const p1 = await b.UserService.getProfile(a.name, c.id)
      expect(p1?.isFollowing).toBe(true)
      expect(p1?.followers).toBe(1)

      const anon = await b.UserService.getProfile(a.name, null)
      expect(anon?.isFollowing).toBe(false)
      expect(anon?.followers).toBe(1)
    })
  })
})
