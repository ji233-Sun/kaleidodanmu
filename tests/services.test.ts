import { describe, beforeAll, afterAll, it, expect } from 'vitest'
import { useBackend, uniq, type Backend } from './helpers/backend'

describe('services', () => {
  let b: Backend
  beforeAll(async () => {
    b = await useBackend()
  })
  afterAll(async () => {
    await b.cleanup()
  })

  async function createUser(): Promise<{ id: number; email: string }> {
    const { user } = await b.AuthService.register(`${uniq('u')}@test.local`, '12345678')
    return user
  }

  describe('AuthService', () => {
    it('register 返回用户（DTO 不含密码哈希）与 token', async () => {
      const { user, token } = await b.AuthService.register(`${uniq('a')}@test.local`, '12345678')
      expect(user.id).toBeGreaterThan(0)
      expect((user as { passwordHash?: string }).passwordHash).toBeUndefined()
      expect(token.length).toBeGreaterThan(10)
    })
    it('register 重复 email 抛 409', async () => {
      const email = `${uniq('dup')}@test.local`
      await b.AuthService.register(email, '12345678')
      await expect(b.AuthService.register(email, '12345678')).rejects.toMatchObject({
        status: 409,
        code: 'email_taken',
      })
    })
    it('login 正确密码通过、错误密码 401', async () => {
      const email = `${uniq('l')}@test.local`
      await b.AuthService.register(email, 'right-pass')
      expect((await b.AuthService.login(email, 'right-pass')).user).toBeTruthy()
      await expect(b.AuthService.login(email, 'wrong-pass')).rejects.toMatchObject({ status: 401 })
    })
    it('login 不存在的用户 401', async () => {
      await expect(b.AuthService.login(`${uniq('none')}@test.local`, 'x')).rejects.toMatchObject({
        status: 401,
      })
    })
    it('签发的 token 是合法 JWT 且可校验出用户', async () => {
      const { user, token } = await b.AuthService.register(`${uniq('lo')}@test.local`, '12345678')
      const claims = b.verifySessionToken(token)
      expect(claims?.sub).toBe(user.id)
    })
  })

  describe('EffectService', () => {
    it('create / list / get / update / remove', async () => {
      const u = await createUser()
      const slug = uniq('fx')
      const e = await b.EffectService.create({ ownerId: u.id, slug, name: 'N' })
      expect(e.slug).toBe(slug)
      expect(e.draftVersionId).toBeNull()
      expect((await b.EffectService.list(u.id)).length).toBe(1)
      expect((await b.EffectService.get(e.id, u.id)).id).toBe(e.id)
      expect((await b.EffectService.update(e.id, u.id, { name: 'N2' })).name).toBe('N2')
      await b.EffectService.remove(e.id, u.id)
      await expect(b.EffectService.get(e.id, u.id)).rejects.toMatchObject({ status: 404 })
    })
    it('create 重复 slug 抛 409', async () => {
      const u = await createUser()
      const slug = uniq('dup')
      await b.EffectService.create({ ownerId: u.id, slug, name: 'N' })
      await expect(b.EffectService.create({ ownerId: u.id, slug, name: 'N' })).rejects.toMatchObject({
        status: 409,
        code: 'slug_already_taken',
      })
    })
    it('访问他人 effect 返回 404（owner 隔离）', async () => {
      const u1 = await createUser()
      const u2 = await createUser()
      const e = await b.EffectService.create({ ownerId: u1.id, slug: uniq('o'), name: 'N' })
      await expect(b.EffectService.get(e.id, u2.id)).rejects.toMatchObject({ status: 404 })
    })
    it('publish 设置对应渠道指针', async () => {
      const u = await createUser()
      const e = await b.EffectService.create({ ownerId: u.id, slug: uniq('p'), name: 'N' })
      const v = await b.VersionService.create(e.id, u.id, {
        version: '1.0.0',
        entry: 'main.js',
        sdkVersion: '0.1',
        schemaVersion: '1',
        manifestJson: '{}',
        code: 'YQ==',
      })
      expect((await b.EffectService.publish(e.id, u.id, v.id, 'published')).publishedVersionId).toBe(v.id)
      expect((await b.EffectService.publish(e.id, u.id, v.id, 'staging')).stagingVersionId).toBe(v.id)
    })
    it('publish 不属于该 effect 的版本抛 404', async () => {
      const u = await createUser()
      const e = await b.EffectService.create({ ownerId: u.id, slug: uniq('p2'), name: 'N' })
      await expect(b.EffectService.publish(e.id, u.id, 999999, 'draft')).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('VersionService', () => {
    const code = 'YQ=='
    const base = {
      entry: 'main.js',
      sdkVersion: '0.1',
      schemaVersion: '1',
      manifestJson: '{}',
      code,
    }
    it('create 计算 sha256 并落库，默认进 draft 指针', async () => {
      const u = await createUser()
      const e = await b.EffectService.create({ ownerId: u.id, slug: uniq('vfx'), name: 'N' })
      const v = await b.VersionService.create(e.id, u.id, { version: '1.0.0', ...base })
      expect(v.sha256).toHaveLength(64)
      expect(v.sizeBytes).toBe(1) // 'YQ==' → 1 byte
      expect((await b.EffectService.get(e.id, u.id)).draftVersionId).toBe(v.id)
    })
    it('重复版本号抛 409', async () => {
      const u = await createUser()
      const e = await b.EffectService.create({ ownerId: u.id, slug: uniq('vd'), name: 'N' })
      await b.VersionService.create(e.id, u.id, { version: '1.0.0', ...base })
      await expect(b.VersionService.create(e.id, u.id, { version: '1.0.0', ...base })).rejects.toMatchObject({
        status: 409,
        code: 'version_exists',
      })
    })
    it('对他人 effect 创建版本抛 404', async () => {
      const u1 = await createUser()
      const u2 = await createUser()
      const e = await b.EffectService.create({ ownerId: u1.id, slug: uniq('vo'), name: 'N' })
      await expect(b.VersionService.create(e.id, u2.id, { version: '1.0.0', ...base })).rejects.toMatchObject({
        status: 404,
      })
    })
    it('list 返回所有版本', async () => {
      const u = await createUser()
      const e = await b.EffectService.create({ ownerId: u.id, slug: uniq('vl'), name: 'N' })
      await b.VersionService.create(e.id, u.id, { version: '1.0.0', ...base })
      await b.VersionService.create(e.id, u.id, { version: '1.1.0', ...base })
      expect((await b.VersionService.list(e.id, u.id)).length).toBe(2)
    })
  })

  describe('DraftService', () => {
    it('save 后 get 返回最新快照（同 effect 单条）', async () => {
      const u = await createUser()
      const e = await b.EffectService.create({ ownerId: u.id, slug: uniq('dr'), name: 'N' })
      const d1 = await b.DraftService.save(e.id, u.id, '{"v":1}')
      await b.DraftService.save(e.id, u.id, '{"v":2}')
      const got = await b.DraftService.get(e.id, u.id)
      expect(got?.id).toBe(d1.id)
      expect(got?.snapshotJson).toBe('{"v":2}')
    })
    it('effect 不存在抛 404', async () => {
      const u = await createUser()
      await expect(b.DraftService.get(999999, u.id)).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('SettingsService', () => {
    it('set / get / list', async () => {
      const key = `feat.${uniq('s')}`
      await b.SettingsService.set(key, '1')
      expect((await b.SettingsService.get(key))?.value).toBe('1')
      await b.SettingsService.set(key, '2')
      expect((await b.SettingsService.get(key))?.value).toBe('2')
      expect((await b.SettingsService.list()).some((s) => s.key === key)).toBe(true)
    })
    it('get 不存在的 key 返回 null', async () => {
      expect(await b.SettingsService.get(`nope.${uniq('x')}`)).toBe(null)
    })
  })

  describe('TokenService', () => {
    it('create 返回明文 token（仅一次）且列表不含明文；revoke 生效', async () => {
      const u = await createUser()
      const created = await b.TokenService.create(u.id, ['upload'], 7)
      expect(created.token.startsWith('kdt_')).toBe(true)
      expect(created.scopes).toEqual(['upload'])
      const list = await b.TokenService.list(u.id)
      expect(list.length).toBe(1)
      expect((list[0] as { token?: string }).token).toBeUndefined()
      await b.TokenService.revoke(created.id, u.id)
      const after = await b.TokenService.list(u.id)
      expect(after[0].revokedAt).toBeTruthy()
    })
  })
})
