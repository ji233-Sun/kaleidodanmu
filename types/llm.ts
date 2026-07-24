import { z } from 'zod'

/** 用户自带模型（BYOK）支持的三种上游协议。 */
export const LLM_PROVIDERS = ['openai-chat', 'openai-responses', 'anthropic'] as const
export type LlmProvider = (typeof LLM_PROVIDERS)[number]
export const LlmProviderSchema = z.enum(LLM_PROVIDERS)

/** 各协议的默认上游地址（baseUrl 留空时使用）。 */
export const LLM_DEFAULT_BASE_URLS: Record<LlmProvider, string> = {
  'openai-chat': 'https://api.openai.com/v1',
  'openai-responses': 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
}

/**
 * 思考深度档位；不设置（undefined）= 不向上游发送任何思考参数，跟随模型默认。
 * 由适配层翻译成各协议参数：openai-chat → reasoning_effort，
 * openai-responses → reasoning.effort，anthropic → thinking.budget_tokens。
 */
export const THINKING_LEVELS = ['low', 'medium', 'high'] as const
export type ThinkingLevel = (typeof THINKING_LEVELS)[number]
export const ThinkingLevelSchema = z.enum(THINKING_LEVELS)

const baseUrlField = z
  .string()
  .trim()
  .url()
  .optional()
  .or(z.literal(''))
  // 去掉尾部斜杠，避免拼接出 //chat/completions 这类双斜杠路径
  .transform((v) => (v ? v.replace(/\/+$/, '') : undefined))

export const UpsertLlmConfigSchema = z
  .object({
    provider: LlmProviderSchema,
    baseUrl: baseUrlField,
    // 允许空字符串：已保存过 key 时留空表示保持不变
    apiKey: z.string().trim().min(1).optional().or(z.literal('')),
    model: z.string().trim().min(1),
    thinking: ThinkingLevelSchema.optional(),
  })
  .strict()
/**
 * 保存配置的入参（路由边界用 UpsertLlmConfigSchema 校验，service/测试直接用这个类型）。
 * zod 推断会把带 transform 的 baseUrl 标成「必须存在但可为 undefined」，与可选语义不符，故显式声明。
 * apiKey 缺省或空 = 保留已保存的 key（首次保存时由 service 校验必填）。
 */
export interface UpsertLlmConfigRequest {
  provider: LlmProvider
  baseUrl?: string
  apiKey?: string
  model: string
  thinking?: ThinkingLevel
}

/** 测试连接：apiKey 可空，空表示用已保存的 key 测试。 */
export const TestLlmConfigSchema = z
  .object({
    provider: LlmProviderSchema,
    baseUrl: baseUrlField,
    apiKey: z.string().trim().min(1).optional().or(z.literal('')),
    model: z.string().trim().min(1),
  })
  .strict()
export type TestLlmConfigRequest = z.infer<typeof TestLlmConfigSchema>

/** 对外暴露的配置视图：永不回传完整 key，只回末 4 位预览。 */
export interface LlmConfigDto {
  provider: LlmProvider
  baseUrl: string
  model: string
  /** 脱敏后的 key 预览，如 `••••abcd` */
  apiKeyPreview: string
  /** 思考深度；缺省 = 不向上游发送思考参数 */
  thinking?: ThinkingLevel
}
