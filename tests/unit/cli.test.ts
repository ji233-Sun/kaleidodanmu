import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sanitizeSlug, mimeForPath } from '@/cli/project'
import { collectAndValidate } from '@/cli/build'
import { SCHEMA_VERSION, SDK_VERSION } from '@/types/manifest'

const VALID_ENTRY = `import { defineEffect } from "@kaleido/sdk";
export default defineEffect({ setup() { return { render() {}, resize() {}, dispose() {} }; } });`

function baseManifest() {
  return {
    schemaVersion: SCHEMA_VERSION,
    sdkVersion: SDK_VERSION,
    version: '1.0.0',
    name: 'Fixture 效果',
    entry: 'entry.mjs',
    recipe: {
      symmetry: 6,
      rotationSpeed: 0,
      motion: 'flow',
      palette: ['#081229', '#8dd8ff'],
      shardScale: 1,
      trail: 0.2,
      density: 1,
    },
    capabilities: ['canvas', 'danmaku'],
    assets: [],
  }
}

const dirs: string[] = []
function makeProject(entry: string, assets: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'kdanmu-cli-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'effect.json'), JSON.stringify(baseManifest()))
  mkdirSync(join(dir, 'dist'), { recursive: true })
  writeFileSync(join(dir, 'dist', 'entry.mjs'), entry)
  const assetNames = Object.keys(assets)
  if (assetNames.length) {
    mkdirSync(join(dir, 'assets'), { recursive: true })
    for (const [name, content] of Object.entries(assets)) writeFileSync(join(dir, 'assets', name), content)
  }
  return dir
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('project 助手', () => {
  it('sanitizeSlug 规整名称', () => {
    expect(sanitizeSlug('My Effect 1')).toBe('my-effect-1')
    expect(sanitizeSlug('  Trim--Me  ')).toBe('trim-me')
    expect(sanitizeSlug('示例弹幕')).toMatch(/^fx-|^[a-z0-9]/)
  })
  it('mimeForPath 识别扩展名', () => {
    expect(mimeForPath('bg.png')).toBe('image/png')
    expect(mimeForPath('a/b.json')).toBe('application/json')
    expect(mimeForPath('note.txt')).toBeNull()
    expect(mimeForPath('noext')).toBeNull()
  })
})

describe('collectAndValidate（构建产物收集 + 校验）', () => {
  it('收集入口与资源并补全 Manifest', () => {
    const dir = makeProject(VALID_ENTRY, { 'note.json': '{"a":1}' })
    const artifact = collectAndValidate(dir)
    expect(artifact.entryPath).toBe('entry.mjs')
    expect(Buffer.from(artifact.entryCode, 'base64').toString()).toContain('defineEffect')
    expect(artifact.assets).toHaveLength(1)
    expect(artifact.assets[0].path).toBe('note.json')
    expect(artifact.assets[0].mime).toBe('application/json')
    expect(artifact.assets[0].sha256).toHaveLength(64)
    expect(artifact.manifest.assets).toHaveLength(1)
    expect(artifact.totalBytes).toBe(artifact.entrySize + artifact.assets[0].sizeBytes)
  })

  it('入口含禁用 API 时拒绝', () => {
    const dir = makeProject(`${VALID_ENTRY}\nfetch("/x");`)
    expect(() => collectAndValidate(dir)).toThrow('fetch')
  })

  it('不受支持的资源类型时拒绝', () => {
    const dir = makeProject(VALID_ENTRY, { 'bad.txt': 'nope' })
    expect(() => collectAndValidate(dir)).toThrow('不受支持')
  })

  it('缺少构建产物时提示先 build', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kdanmu-cli-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'effect.json'), JSON.stringify(baseManifest()))
    expect(() => collectAndValidate(dir)).toThrow('kdanmu build')
  })
})
