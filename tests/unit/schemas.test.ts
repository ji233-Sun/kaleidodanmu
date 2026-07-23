import { describe, it, expect } from 'vitest'
import {
  RegisterSchema,
  CreateEffectSchema,
  UpdateEffectSchema,
  PublishEffectSchema,
  CreateVersionSchema,
  SaveDraftSchema,
  CreateTokenSchema,
  SEMVER_REGEX,
  SLUG_REGEX,
} from '@/types'

describe('auth schemas', () => {
  it('接受合法 email + 8 位密码', () => {
    expect(RegisterSchema.parse({ email: 'a@b.com', password: '12345678' })).toMatchObject({ email: 'a@b.com' })
  })
  it('拒绝非法 email', () => {
    expect(() => RegisterSchema.parse({ email: 'nope', password: '12345678' })).toThrow()
  })
  it('拒绝过短密码', () => {
    expect(() => RegisterSchema.parse({ email: 'a@b.com', password: '123' })).toThrow()
  })
})

describe('effect schemas', () => {
  it('接受合法 slug / name', () => {
    expect(CreateEffectSchema.parse({ slug: 'my-fx-1', name: 'Fx' }).slug).toBe('my-fx-1')
  })
  it('拒绝大写 / 空格 / 开头连字符的 slug', () => {
    expect(() => CreateEffectSchema.parse({ slug: 'Bad', name: 'x' })).toThrow()
    expect(() => CreateEffectSchema.parse({ slug: 'a b', name: 'x' })).toThrow()
    expect(() => CreateEffectSchema.parse({ slug: '-ab', name: 'x' })).toThrow()
  })
  it('UpdateEffectSchema 全可选', () => {
    expect(UpdateEffectSchema.parse({})).toBeTruthy()
    expect(UpdateEffectSchema.parse({ name: 'n', slug: 'n2' })).toBeTruthy()
  })
  it('PublishEffectSchema 限定 channel 枚举', () => {
    expect(PublishEffectSchema.parse({ versionId: 1, channel: 'draft' }).channel).toBe('draft')
    expect(() => PublishEffectSchema.parse({ versionId: 1, channel: 'nope' })).toThrow()
    expect(() => PublishEffectSchema.parse({ versionId: 0, channel: 'draft' })).toThrow()
  })
  it('SLUG_REGEX 形态', () => {
    expect(SLUG_REGEX.test('abc-1')).toBe(true)
    expect(SLUG_REGEX.test('-ab')).toBe(false)
  })
})

describe('version schemas', () => {
  const base = {
    version: '1.0.0',
    entry: 'main.js',
    sdkVersion: '0.1',
    schemaVersion: '1',
    manifestJson: '{}',
    code: 'YQ==',
  }
  it('接受合法输入', () => {
    expect(CreateVersionSchema.parse(base).version).toBe('1.0.0')
  })
  it('拒绝非 semver version', () => {
    expect(() => CreateVersionSchema.parse({ ...base, version: 'v1' })).toThrow()
    expect(() => CreateVersionSchema.parse({ ...base, version: '1.2' })).toThrow()
  })
  it('SEMVER_REGEX 形态（含预发布）', () => {
    expect(SEMVER_REGEX.test('1.2.3')).toBe(true)
    expect(SEMVER_REGEX.test('1.2.3-beta.1')).toBe(true)
    expect(SEMVER_REGEX.test('1.2')).toBe(false)
  })
})

describe('draft / token schemas', () => {
  it('SaveDraftSchema 接受字符串', () => {
    expect(SaveDraftSchema.parse({ snapshotJson: '{}' }).snapshotJson).toBe('{}')
  })
  it('CreateTokenSchema scopes 默认空数组，expiresInDays 可选', () => {
    const out = CreateTokenSchema.parse({})
    expect(out.scopes).toEqual([])
    expect(out.expiresInDays).toBeUndefined()
  })
})
