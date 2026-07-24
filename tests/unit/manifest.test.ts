import { describe, it, expect } from 'vitest'
import {
  EffectManifestSchema,
  AssetSchema,
  SafePathSchema,
  CreateVersionSchema,
  SCHEMA_VERSION,
  SDK_VERSION,
  LIMITS,
} from '@/types'

const validManifest = {
  schemaVersion: SCHEMA_VERSION,
  sdkVersion: SDK_VERSION,
  version: '1.0.0',
  name: '示例效果',
  entry: 'entry.mjs',
  recipe: {
    symmetry: 6,
    rotationSpeed: 0.1,
    motion: 'spiral' as const,
    palette: ['#081229', '#8dd8ff'],
    shardScale: 1,
    trail: 0.2,
    density: 1,
  },
  capabilities: ['canvas', 'danmaku'],
  assets: [],
}

describe('EffectManifestSchema', () => {
  it('接受合法 Manifest 并给 capabilities/assets 默认值', () => {
    const { capabilities: _cap, assets: _assets, ...rest } = validManifest
    void _cap
    void _assets
    const parsed = EffectManifestSchema.parse(rest)
    expect(parsed.capabilities).toEqual([])
    expect(parsed.assets).toEqual([])
    expect(parsed.entry).toBe('entry.mjs')
  })
  it('拒绝错误的 schemaVersion', () => {
    expect(() => EffectManifestSchema.parse({ ...validManifest, schemaVersion: '1' })).toThrow()
  })
  it('拒绝非 semver version 与非法配方', () => {
    expect(() => EffectManifestSchema.parse({ ...validManifest, version: '1.2' })).toThrow()
    expect(() =>
      EffectManifestSchema.parse({ ...validManifest, recipe: { ...validManifest.recipe, symmetry: 99 } }),
    ).toThrow()
  })
  it('拒绝未知能力与多余字段（strict）', () => {
    expect(() => EffectManifestSchema.parse({ ...validManifest, capabilities: ['nope'] })).toThrow()
    expect(() => EffectManifestSchema.parse({ ...validManifest, extra: 1 })).toThrow()
  })
})

describe('SafePathSchema', () => {
  it('接受普通相对路径', () => {
    expect(SafePathSchema.parse('assets/bg.png')).toBe('assets/bg.png')
  })
  it('拒绝绝对路径与 .. 穿越', () => {
    expect(() => SafePathSchema.parse('/etc/passwd')).toThrow()
    expect(() => SafePathSchema.parse('../secret')).toThrow()
    expect(() => SafePathSchema.parse('a/../../b')).toThrow()
  })
})

describe('AssetSchema', () => {
  const asset = { path: 'assets/x.png', mime: 'image/png', sha256: 'a'.repeat(64), sizeBytes: 100 }
  it('接受合法资源项', () => {
    expect(AssetSchema.parse(asset).path).toBe('assets/x.png')
  })
  it('拒绝非法 sha256 与超限体积', () => {
    expect(() => AssetSchema.parse({ ...asset, sha256: 'zzz' })).toThrow()
    expect(() => AssetSchema.parse({ ...asset, sizeBytes: LIMITS.maxAssetBytes + 1 })).toThrow()
  })
})

describe('CreateVersionSchema 多文件', () => {
  const base = {
    version: '1.0.0',
    entry: 'entry.mjs',
    sdkVersion: SDK_VERSION,
    schemaVersion: SCHEMA_VERSION,
    manifestJson: '{}',
    code: 'YQ==',
  }
  it('assets 默认空数组', () => {
    expect(CreateVersionSchema.parse(base).assets).toEqual([])
  })
  it('接受合法 assets 并拒绝穿越 path', () => {
    expect(
      CreateVersionSchema.parse({
        ...base,
        assets: [{ path: 'assets/a.png', mime: 'image/png', data: 'YQ==' }],
      }).assets,
    ).toHaveLength(1)
    expect(() =>
      CreateVersionSchema.parse({ ...base, assets: [{ path: '../a', mime: 'image/png', data: 'YQ==' }] }),
    ).toThrow()
  })
})
