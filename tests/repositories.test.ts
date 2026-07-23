import { describe, beforeAll, afterAll, it, expect } from 'vitest'
import { useBackend, uniq, type Backend } from './helpers/backend'

describe('repositories', () => {
  let b: Backend
  beforeAll(async () => {
    b = await useBackend()
  })
  afterAll(async () => {
    await b.cleanup()
  })

  describe('UserRepository', () => {
    it('create / findById / findByEmail，默认 role=creator', async () => {
      const email = `${uniq('user')}@test.local`
      const u = await b.UserRepository.create({ email, passwordHash: 'h' })
      expect(u.id).toBeGreaterThan(0)
      expect((await b.UserRepository.findById(u.id))?.email).toBe(email)
      expect((await b.UserRepository.findByEmail(email))?.id).toBe(u.id)
      expect((await b.UserRepository.findById(u.id))?.role).toBe('creator')
    })
    it('findByEmail 不存在返回 null', async () => {
      expect(await b.UserRepository.findByEmail(`${uniq('nope')}@test.local`)).toBe(null)
    })
  })

  describe('SessionRepository', () => {
    it('create / findByToken / delete', async () => {
      const u = await b.UserRepository.create({ email: `${uniq('s')}@test.local`, passwordHash: 'h' })
      const id = b.randomToken()
      await b.SessionRepository.create({ id, userId: u.id, expiresAt: new Date(Date.now() + 1000) })
      expect((await b.SessionRepository.findByToken(id))?.userId).toBe(u.id)
      await b.SessionRepository.delete(id)
      expect(await b.SessionRepository.findByToken(id)).toBe(null)
    })
  })

  describe('EffectRepository', () => {
    it('create / findAllByOwner / findBySlug', async () => {
      const u = await b.UserRepository.create({ email: `${uniq('e')}@test.local`, passwordHash: 'h' })
      const slug = uniq('fx')
      const e = await b.EffectRepository.create({ ownerId: u.id, slug, name: 'N' })
      expect(e.slug).toBe(slug)
      expect((await b.EffectRepository.findAllByOwner(u.id)).length).toBe(1)
      expect((await b.EffectRepository.findBySlug(slug))?.id).toBe(e.id)
    })
    it('findAllByOwner 仅返回该 owner 的', async () => {
      const u1 = await b.UserRepository.create({ email: `${uniq('o1')}@test.local`, passwordHash: 'h' })
      const u2 = await b.UserRepository.create({ email: `${uniq('o2')}@test.local`, passwordHash: 'h' })
      await b.EffectRepository.create({ ownerId: u1.id, slug: uniq('a'), name: 'n' })
      await b.EffectRepository.create({ ownerId: u2.id, slug: uniq('b'), name: 'n' })
      expect((await b.EffectRepository.findAllByOwner(u1.id)).length).toBe(1)
    })
    it('findByIdOwned 仅返回属主匹配的', async () => {
      const u1 = await b.UserRepository.create({ email: `${uniq('p1')}@test.local`, passwordHash: 'h' })
      const u2 = await b.UserRepository.create({ email: `${uniq('p2')}@test.local`, passwordHash: 'h' })
      const e = await b.EffectRepository.create({ ownerId: u1.id, slug: uniq('c'), name: 'n' })
      expect((await b.EffectRepository.findByIdOwned(e.id, u1.id))?.id).toBe(e.id)
      expect(await b.EffectRepository.findByIdOwned(e.id, u2.id)).toBe(null)
    })
    it('update 改 name，delete 后查不到', async () => {
      const u = await b.UserRepository.create({ email: `${uniq('u')}@test.local`, passwordHash: 'h' })
      const e = await b.EffectRepository.create({ ownerId: u.id, slug: uniq('up'), name: 'old' })
      await b.EffectRepository.update(e.id, { name: 'new' })
      expect((await b.EffectRepository.findById(e.id))?.name).toBe('new')
      await b.EffectRepository.delete(e.id)
      expect(await b.EffectRepository.findById(e.id)).toBe(null)
    })
  })

  describe('EffectVersionRepository', () => {
    it('create / findAllByEffect / findByEffectAndVersion', async () => {
      const u = await b.UserRepository.create({ email: `${uniq('v')}@test.local`, passwordHash: 'h' })
      const e = await b.EffectRepository.create({ ownerId: u.id, slug: uniq('efx'), name: 'n' })
      const v = await b.EffectVersionRepository.create({
        effectId: e.id,
        version: '1.0.0',
        sha256: 'a'.repeat(64),
        entry: 'main.js',
        sizeBytes: 10,
        sdkVersion: '0.1',
        schemaVersion: '1',
        manifestJson: '{}',
        storageKey: 'k',
        createdBy: u.id,
      })
      expect(v.id).toBeGreaterThan(0)
      expect((await b.EffectVersionRepository.findAllByEffect(e.id)).length).toBe(1)
      expect((await b.EffectVersionRepository.findByEffectAndVersion(e.id, '1.0.0'))?.id).toBe(v.id)
      expect(await b.EffectVersionRepository.findByEffectAndVersion(e.id, '2.0.0')).toBe(null)
    })
  })

  describe('DraftRepository', () => {
    it('upsert 首次插入、再次更新同一行', async () => {
      const u = await b.UserRepository.create({ email: `${uniq('dr')}@test.local`, passwordHash: 'h' })
      const e = await b.EffectRepository.create({ ownerId: u.id, slug: uniq('drfx'), name: 'n' })
      const d1 = await b.DraftRepository.upsert({ effectId: e.id, ownerId: u.id, snapshotJson: '{"v":1}' })
      const d2 = await b.DraftRepository.upsert({ effectId: e.id, ownerId: u.id, snapshotJson: '{"v":2}' })
      expect(d2.id).toBe(d1.id)
      expect((await b.DraftRepository.findByEffectOwned(e.id, u.id))?.snapshotJson).toBe('{"v":2}')
    })
  })

  describe('AppSettingRepository', () => {
    it('upsert 插入再更新；findAll / findByKey', async () => {
      const key = `shared.${uniq('s')}`
      await b.AppSettingRepository.upsert(key, '1')
      await b.AppSettingRepository.upsert(key, '2')
      expect((await b.AppSettingRepository.findByKey(key))?.value).toBe('2')
      const all = await b.AppSettingRepository.findAll()
      expect(all.some((x) => x.key === key)).toBe(true)
    })
  })

  describe('ApiTokenRepository', () => {
    it('create / findAllByUser / revoke', async () => {
      const u = await b.UserRepository.create({ email: `${uniq('t')}@test.local`, passwordHash: 'h' })
      const t = await b.ApiTokenRepository.create({
        userId: u.id,
        tokenHash: 'h'.repeat(64),
        scopes: '[]',
        expiresAt: null,
      })
      expect((await b.ApiTokenRepository.findAllByUser(u.id)).length).toBe(1)
      await b.ApiTokenRepository.revoke(t.id, u.id)
      const got = await b.ApiTokenRepository.findAllByUser(u.id)
      expect(got[0].revokedAt).toBeInstanceOf(Date)
    })
  })
})
