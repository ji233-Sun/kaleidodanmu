import type { EffectDefinition } from './types'

export * from './types'

/**
 * 声明一个 Effect。运行时是恒等函数——真正的执行发生在隔离 Canvas Runtime 中，
 * 这里只提供类型约束，让 ADE / CLI / 编辑器获得完整的生命周期提示。
 */
export function defineEffect(definition: EffectDefinition): EffectDefinition {
  return definition
}

/** 宿主注入的资源表挂载点：path → blob/object URL。跨模块副本共享。 */
const ASSET_REGISTRY_KEY = '__KALEIDO_ASSETS__'

type AssetRegistry = Record<string, string>

function registry(): AssetRegistry {
  const scope = globalThis as typeof globalThis & { [ASSET_REGISTRY_KEY]?: AssetRegistry }
  return scope[ASSET_REGISTRY_KEY] ?? {}
}

/**
 * 解析随包上传的静态资源到可用 URL。资源由运行时宿主在 load 时转成 blob URL 并注入到
 * 全局表；未注册时原样返回 path（便于本地 dev 直接用相对路径）。Effect 内不允许 fetch，
 * 所有资源都必须经 assetUrl 取得。
 */
export function assetUrl(path: string): string {
  return registry()[path] ?? path
}
