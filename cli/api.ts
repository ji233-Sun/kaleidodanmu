// kdanmu API 客户端：读取 ~/.kdanmu/credentials.json 的令牌，封装 effects / versions / publish 调用。

import { loadCredentials, resolveBaseUrl } from './config'

export class CliApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'CliApiError'
  }
}

export interface EffectDto {
  id: number
  slug: string
  name: string
  draftVersionId: number | null
  stagingVersionId: number | null
  publishedVersionId: number | null
}

export interface VersionDto {
  id: number
  version: string
  sha256: string
  sizeBytes: number
  createdAt: string
}

export interface AssetUpload {
  path: string
  mime: string
  data: string
}

export interface CreateVersionInput {
  version: string
  entry: string
  sdkVersion: string
  schemaVersion: string
  manifestJson: string
  code: string
  assets: AssetUpload[]
  channel?: 'draft' | 'staging' | 'published'
}

interface FetchInit {
  method?: string
  json?: unknown
}

export interface ApiClient {
  baseUrl: string
  me(): Promise<{ email: string; id: number }>
  listEffects(): Promise<EffectDto[]>
  findBySlug(slug: string): Promise<EffectDto | null>
  createEffect(input: { slug: string; name: string }): Promise<EffectDto>
  listVersions(effectId: number): Promise<VersionDto[]>
  createVersion(effectId: number, input: CreateVersionInput): Promise<VersionDto>
  publish(effectId: number, versionId: number, channel: 'draft' | 'staging' | 'published'): Promise<EffectDto>
}

/** 构造 API 客户端；未登录时抛 CliApiError(401)。baseUrlOpt 覆盖凭证里的地址。 */
export function createClient(baseUrlOpt?: string): ApiClient {
  const creds = loadCredentials()
  if (!creds) throw new CliApiError(401, 'not_logged_in', '未登录，请先执行 kdanmu login')
  const baseUrl = baseUrlOpt ? resolveBaseUrl(baseUrlOpt) : creds.baseUrl
  const token = creds.token

  async function call<T>(path: string, init: FetchInit = {}): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      })
    } catch (e) {
      throw new CliApiError(0, 'network_error', `无法连接后端 ${baseUrl}：${e instanceof Error ? e.message : String(e)}`)
    }
    if (res.status === 204) return undefined as T
    const data = (await res.json().catch(() => null)) as unknown
    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string } } | null)?.error
      if (res.status === 401) {
        throw new CliApiError(401, err?.code ?? 'unauthorized', '凭证无效或已过期，请重新执行 kdanmu login')
      }
      throw new CliApiError(res.status, err?.code ?? 'unknown_error', err?.message ?? `请求失败（HTTP ${res.status}）`)
    }
    return data as T
  }

  return {
    baseUrl,
    async me() {
      const { user } = await call<{ user: { email: string; id: number } }>('/api/auth/me')
      return user
    },
    async listEffects() {
      const { effects } = await call<{ effects: EffectDto[] }>('/api/effects')
      return effects
    },
    async findBySlug(slug) {
      const effects = await this.listEffects()
      return effects.find((e) => e.slug === slug) ?? null
    },
    async createEffect(input) {
      const { effect } = await call<{ effect: EffectDto }>('/api/effects', { method: 'POST', json: input })
      return effect
    },
    async listVersions(effectId) {
      const { versions } = await call<{ versions: VersionDto[] }>(`/api/effects/${effectId}/versions`)
      return versions
    },
    async createVersion(effectId, input) {
      const { version } = await call<{ version: VersionDto }>(`/api/effects/${effectId}/versions`, {
        method: 'POST',
        json: input,
      })
      return version
    },
    async publish(effectId, versionId, channel) {
      const { effect } = await call<{ effect: EffectDto }>(`/api/effects/${effectId}/publish`, {
        method: 'POST',
        json: { versionId, channel },
      })
      return effect
    },
  }
}
