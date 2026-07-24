import { LlmConfigRepository } from '@/server/repositories/llmConfig.repository'
import { decryptSecret, encryptSecret } from '@/server/utils/crypto'
import { HttpError } from '@/server/utils/errors'
import { LLM_DEFAULT_BASE_URLS, type LlmConfigDto, type LlmProvider, type ThinkingLevel, type UpsertLlmConfigRequest } from '@/types'
import type { LlmConfig } from '@/server/database/entities/llmConfig.entity'

/** 代理解析出的完整上游配置；apiKey 为明文，只在服务端内部流转，绝不随接口返回。 */
export interface ResolvedLlmConfig {
  provider: LlmProvider
  baseUrl: string
  apiKey: string
  model: string
  /** 思考深度；缺省 = 不向上游发送思考参数 */
  thinking?: ThinkingLevel
}

/** 落库的 '' 表示默认（不发送思考参数）。 */
function toThinkingLevel(value: string): ThinkingLevel | undefined {
  return value === 'low' || value === 'medium' || value === 'high' ? value : undefined
}

function toDto(row: LlmConfig): LlmConfigDto {
  const apiKey = decryptSecret(row.apiKeyEncrypted)
  const thinking = toThinkingLevel(row.thinking)
  return {
    provider: row.provider as LlmProvider,
    baseUrl: row.baseUrl,
    model: row.model,
    apiKeyPreview: `••••${apiKey.slice(-4)}`,
    ...(thinking ? { thinking } : {}),
  }
}

export const LlmConfigService = {
  async getDto(userId: number): Promise<LlmConfigDto | null> {
    const row = await LlmConfigRepository.findByUser(userId)
    return row ? toDto(row) : null
  },

  async upsert(userId: number, input: UpsertLlmConfigRequest): Promise<LlmConfigDto> {
    const baseUrl = input.baseUrl ?? LLM_DEFAULT_BASE_URLS[input.provider]
    // apiKey 留空 = 保留已保存的 key；首次保存则必填
    const existing = input.apiKey ? null : await LlmConfigRepository.findByUser(userId)
    const apiKeyEncrypted = input.apiKey ? encryptSecret(input.apiKey) : existing?.apiKeyEncrypted
    if (!apiKeyEncrypted) throw new HttpError(400, 'llm_api_key_required', '首次保存需要输入 API Key')
    const row = await LlmConfigRepository.upsert(userId, {
      provider: input.provider,
      baseUrl,
      apiKeyEncrypted,
      model: input.model,
      thinking: input.thinking ?? '',
    })
    return toDto(row)
  },

  async remove(userId: number): Promise<void> {
    await LlmConfigRepository.deleteByUser(userId)
  },

  /** 供 LLM 代理解析上游配置：返回解密后的明文 key；未配置返回 null。 */
  async resolveForUser(userId: number): Promise<ResolvedLlmConfig | null> {
    const row = await LlmConfigRepository.findByUser(userId)
    if (!row) return null
    const thinking = toThinkingLevel(row.thinking)
    return {
      provider: row.provider as LlmProvider,
      baseUrl: row.baseUrl,
      apiKey: decryptSecret(row.apiKeyEncrypted),
      model: row.model,
      ...(thinking ? { thinking } : {}),
    }
  },
}
