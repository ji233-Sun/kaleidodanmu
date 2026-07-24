import { z } from 'zod'
import type { Recipe } from '@/lib/types'
import { DEFAULT_EFFECT_SOURCE, validateEffectSource } from '@/lib/runtime/effect'
import { ADE_GUIDE, ADE_GUIDE_FILE } from './guide'
import type { AdeToolCall } from './protocol'

const HexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/)

export const RecipeSchema = z
  .object({
    symmetry: z.number().int().min(3).max(12),
    rotationSpeed: z.number().min(-0.6).max(0.6),
    motion: z.enum(['spiral', 'burst', 'orbit', 'flow']),
    palette: z.array(HexColorSchema).min(2).max(6),
    shardScale: z.number().min(0.5).max(2),
    trail: z.number().min(0).max(0.9),
    density: z.number().min(0.3).max(2),
  })
  .strict()

const EffectProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(64),
    recipe: RecipeSchema,
  })
  .strict()

export interface PreviewUpdate {
  name: string
  recipe: Recipe
  entrySource: string
  changes: string[]
}

/**
 * Studio 的最小浏览器工程。文件只保存在该页面内存中，工具不会接触宿主文件系统。
 * effect.json 保存元数据，index.ts 在隔离的 Canvas Runtime 中实际执行。
 */
export class BrowserEffectProject {
  private readonly files = new Map<string, string>()
  private dirty = false

  hydrate(name: string, recipe: Recipe, entrySource = DEFAULT_EFFECT_SOURCE): void {
    this.files.set('effect.json', JSON.stringify({ name, recipe }, null, 2))
    this.files.set('index.ts', entrySource)
    this.dirty = true
  }

  /** 导出当前虚拟文件内容，用于服务端持久化。 */
  snapshotFiles(): { 'effect.json': string; 'index.ts': string } {
    return {
      'effect.json': this.files.get('effect.json') ?? '',
      'index.ts': this.files.get('index.ts') ?? '',
    }
  }

  /** 从服务端快照恢复；缺失或非法时回退到空工程。 */
  restoreFiles(files: Partial<{ 'effect.json': string; 'index.ts': string }>): void {
    if (typeof files['effect.json'] === 'string') this.files.set('effect.json', files['effect.json'])
    if (typeof files['index.ts'] === 'string') this.files.set('index.ts', files['index.ts'])
    this.dirty = false
  }
  execute(call: AdeToolCall): { result: string; preview?: PreviewUpdate } {
    try {
      const args = this.parseArguments(call.arguments)
      switch (call.name) {
        case 'read_file':
          return { result: this.readFile(args) }
        case 'write_file':
          return { result: this.writeFile(args) }
        case 'validate':
          return { result: this.validate() }
        case 'refresh_preview': {
          const preview = this.refreshPreview()
          return { result: '沙箱预览已刷新', preview }
        }
      }
    } catch (error) {
      return { result: '工具失败：' + (error instanceof Error ? error.message : '未知错误') }
    }
  }

  private parseArguments(raw: string): Record<string, unknown> {
    try {
      const value: unknown = raw ? JSON.parse(raw) : {}
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数必须是 JSON 对象')
      return value as Record<string, unknown>
    } catch (error) {
      if (error instanceof Error) throw new Error('参数无效：' + error.message)
      throw new Error('参数无效')
    }
  }

  private filePath(args: Record<string, unknown>): 'effect.json' | 'index.ts' | typeof ADE_GUIDE_FILE {
    if (args.path === 'effect.json' || args.path === 'index.ts' || args.path === ADE_GUIDE_FILE) return args.path
    throw new Error('仅允许访问 effect.json、index.ts 或 ' + ADE_GUIDE_FILE)
  }

  private readFile(args: Record<string, unknown>): string {
    const path = this.filePath(args)
    if (path === ADE_GUIDE_FILE) return ADE_GUIDE
    const content = this.files.get(path)
    return content === undefined ? path + ' 不存在' : content
  }

  private writeFile(args: Record<string, unknown>): string {
    const path = this.filePath(args)
    if (path === ADE_GUIDE_FILE) throw new Error(ADE_GUIDE_FILE + ' 是只读文档，不能修改')
    if (typeof args.content !== 'string' || args.content.length > 20_000) {
      throw new Error('文件内容必须是长度不超过 20000 的字符串')
    }
    if (path === 'effect.json') {
      let parsed: unknown
      try {
        parsed = JSON.parse(args.content)
      } catch {
        throw new Error('effect.json 必须是合法 JSON')
      }
      EffectProjectSchema.parse(parsed)
    }
    if (path === 'index.ts') validateEffectSource(args.content)
    this.files.set(path, args.content)
    this.dirty = true
    return '已写入 ' + path
  }

  private validate(): string {
    const effect = this.files.get('effect.json')
    const entry = this.files.get('index.ts')
    if (!effect) throw new Error('缺少 effect.json')
    if (!entry) throw new Error('缺少 index.ts')
    EffectProjectSchema.parse(JSON.parse(effect))
    validateEffectSource(entry)
    return '校验通过：配方、Effect 生命周期与浏览器安全限制均有效'
  }

  private refreshPreview(): PreviewUpdate {
    if (!this.dirty) throw new Error('没有可刷新的改动')
    this.validate()
    const project = EffectProjectSchema.parse(JSON.parse(this.files.get('effect.json')!))
    const entrySource = this.files.get('index.ts')!
    this.dirty = false
    return {
      name: project.name,
      recipe: project.recipe,
      entrySource,
      changes: ['已更新浏览器内 Effect 工程并刷新 Canvas 预览'],
    }
  }
}
