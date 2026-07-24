import { ADE_TOOL_NAMES, AdeAgentTurnResponseSchema, type AdeAgentMessage, type AdeAgentTurnResponse } from '@/lib/ade/protocol'
import { HttpError } from '@/server/utils/errors'
import type { LlmProvider, ThinkingLevel } from '@/types'
import type { ResolvedLlmConfig } from '@/server/services/llmConfig.service'

/** 服务端固定的工具定义沿用 OpenAI Chat 格式，各适配器自行映射。 */
export interface LlmToolSpec {
  type: 'function'
  function: { name: string; description: string; parameters: unknown }
}

export interface LlmUpstreamRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

/** 每个上游协议一个适配器：把 ADE 消息/工具翻译成上游请求，再把上游响应解析回统一结构。 */
export interface LlmUpstreamAdapter {
  buildRequest(
    config: ResolvedLlmConfig,
    systemPrompt: string,
    messages: AdeAgentMessage[],
    tools: readonly LlmToolSpec[],
  ): LlmUpstreamRequest
  parseResponse(payload: unknown): AdeAgentTurnResponse
}

function invalidToolCall(): never {
  throw new HttpError(502, 'llm_invalid_response', 'LLM returned an invalid tool call')
}

function assertToolName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !ADE_TOOL_NAMES.includes(name as (typeof ADE_TOOL_NAMES)[number])) invalidToolCall()
}

/* ------------------------- OpenAI Chat Completions ------------------------- */

function usesOfficialDeepSeekThinking(config: ResolvedLlmConfig): boolean {
  if (!config.thinking || !config.model.toLowerCase().includes('deepseek')) return false
  try {
    return new URL(config.baseUrl).hostname === 'api.deepseek.com'
  } catch {
    return false
  }
}

function toChatMessage(message: AdeAgentMessage, deepSeekThinking = false): Record<string, unknown> {
  if (message.role === 'user') return { role: 'user', content: message.content }
  if (message.role === 'tool') return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
  const hasToolCalls = message.toolCalls.length > 0
  return {
    role: 'assistant',
    // DeepSeek V4 thinking 要求 tool-call assistant 带非空 content；官方兼容实现使用 "." 占位。
    content: deepSeekThinking && hasToolCalls && !message.content ? '.' : message.content || null,
    tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })),
    // DeepSeek thinking + tools 要求字段存在；优先原样回传，SDK 未暴露时用空串兜底。
    ...(message.reasoningContent !== undefined
      ? { reasoning_content: message.reasoningContent }
      : deepSeekThinking && hasToolCalls
        ? { reasoning_content: '' }
        : {}),
  }
}

const openaiChatAdapter: LlmUpstreamAdapter = {
  buildRequest: (config, systemPrompt, messages, tools) => {
    const deepSeekThinking = usesOfficialDeepSeekThinking(config)
    return {
      url: config.baseUrl + '/chat/completions',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.apiKey },
      body: {
        model: config.model,
        // 思考档位互斥于 temperature：o 系列 / gpt-5 等推理模型会拒绝自定义 temperature
        ...(config.thinking ? { reasoning_effort: config.thinking } : { temperature: 0.2 }),
        ...(deepSeekThinking ? { thinking: { type: 'enabled' } } : {}),
        max_tokens: 16_000,
        messages: [{ role: 'system', content: systemPrompt }, ...messages.map((message) => toChatMessage(message, deepSeekThinking))],
        tools,
        // DeepSeek V4 thinking mode 明确不接受 tool_choice；其他 Chat Completions 保持原行为。
        ...(!deepSeekThinking ? { tool_choice: 'auto' } : {}),
      },
    }
  },

  parseResponse(payload) {
    const message = (payload as { choices?: Array<{ message?: unknown }> })?.choices?.[0]?.message as
      | { content?: unknown; reasoning_content?: unknown; reasoning?: unknown; tool_calls?: unknown }
      | undefined
    if (!message) throw new HttpError(502, 'llm_invalid_response', 'LLM returned no completion')
    const toolCalls = Array.isArray(message.tool_calls)
      ? message.tool_calls.map((call) => {
          const item = call as { id?: unknown; function?: { name?: unknown; arguments?: unknown } }
          if (typeof item.id !== 'string' || typeof item.function?.arguments !== 'string') invalidToolCall()
          assertToolName(item.function?.name)
          return { id: item.id, name: item.function!.name, arguments: item.function!.arguments as string }
        })
      : []
    // 思考内容必须解析出来并在后续轮次回传（思考模式下上游会校验），各家返回键不同：
    // DeepSeek 系是 reasoning_content，OpenRouter / GLM 等常见 reasoning
    const reasoning = message.reasoning_content ?? message.reasoning
    return AdeAgentTurnResponseSchema.parse({
      message: {
        content: typeof message.content === 'string' ? message.content : '',
        toolCalls,
        ...(typeof reasoning === 'string' ? { reasoningContent: reasoning } : {}),
      },
    })
  },
}

/* ----------------------------- OpenAI Responses ---------------------------- */

function toResponsesInput(messages: AdeAgentMessage[]): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = []
  for (const message of messages) {
    if (message.role === 'user') {
      input.push({ role: 'user', content: message.content })
    } else if (message.role === 'assistant') {
      if (message.content) input.push({ role: 'assistant', content: message.content })
      for (const call of message.toolCalls) {
        input.push({ type: 'function_call', call_id: call.id, name: call.name, arguments: call.arguments })
      }
    } else {
      input.push({ type: 'function_call_output', call_id: message.toolCallId, output: message.content })
    }
  }
  return input
}

const openaiResponsesAdapter: LlmUpstreamAdapter = {
  buildRequest: (config, systemPrompt, messages, tools) => ({
    url: config.baseUrl + '/responses',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.apiKey },
    body: {
      model: config.model,
      instructions: systemPrompt,
      input: toResponsesInput(messages),
      tools: tools.map((tool) => ({
        type: 'function',
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      })),
      tool_choice: 'auto',
      max_output_tokens: 16_000,
      ...(config.thinking ? { reasoning: { effort: config.thinking } } : {}),
    },
  }),

  parseResponse(payload) {
    const output = (payload as { output?: unknown })?.output
    if (!Array.isArray(output)) throw new HttpError(502, 'llm_invalid_response', 'LLM returned no completion')
    const texts: string[] = []
    const reasoningTexts: string[] = []
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = []
    for (const raw of output) {
      const item = raw as {
        type?: unknown
        content?: Array<{ type?: unknown; text?: unknown }>
        summary?: Array<{ type?: unknown; text?: unknown }>
        call_id?: unknown
        name?: unknown
        arguments?: unknown
      }
      if (item.type === 'message') {
        for (const part of item.content ?? []) {
          if (part.type === 'output_text' && typeof part.text === 'string') texts.push(part.text)
        }
      } else if (item.type === 'reasoning') {
        // reasoning 摘要仅用于展示；不回传给上游（Responses 协议不要求回传）
        for (const part of item.summary ?? []) {
          if (part.type === 'summary_text' && typeof part.text === 'string') reasoningTexts.push(part.text)
        }
      } else if (item.type === 'function_call') {
        if (typeof item.call_id !== 'string' || typeof item.arguments !== 'string') invalidToolCall()
        assertToolName(item.name)
        toolCalls.push({ id: item.call_id, name: item.name as string, arguments: item.arguments })
      }
    }
    const reasoningContent = reasoningTexts.join('')
    return AdeAgentTurnResponseSchema.parse({
      message: { content: texts.join(''), toolCalls, ...(reasoningContent ? { reasoningContent } : {}) },
    })
  },
}

/* --------------------------- Anthropic Messages ---------------------------- */

type AnthropicBlock = Record<string, unknown>

/** 思考档位 → thinking.budget_tokens（须 ≥1024 且小于 max_tokens 16000）。 */
const ANTHROPIC_THINKING_BUDGETS: Record<ThinkingLevel, number> = {
  low: 1024,
  medium: 4096,
  high: 12_000,
}

function toAnthropicMessages(messages: AdeAgentMessage[]): Array<{ role: 'user' | 'assistant'; content: string | AnthropicBlock[] }> {
  const result: Array<{ role: 'user' | 'assistant'; content: string | AnthropicBlock[] }> = []
  for (const message of messages) {
    if (message.role === 'user') {
      result.push({ role: 'user', content: message.content })
    } else if (message.role === 'assistant') {
      const content: AnthropicBlock[] = []
      // 思考块必须作为首个 block 原样带回（含签名），否则工具链续轮上游 400
      if (message.reasoningContent && message.reasoningSignature) {
        content.push({ type: 'thinking', thinking: message.reasoningContent, signature: message.reasoningSignature })
      }
      if (message.content) content.push({ type: 'text', text: message.content })
      for (const call of message.toolCalls) {
        content.push({ type: 'tool_use', id: call.id, name: call.name, input: JSON.parse(call.arguments || '{}') })
      }
      result.push({ role: 'assistant', content })
    } else {
      // tool 结果并入 user 消息的 tool_result content block；连续 tool 消息合并为一条
      const block: AnthropicBlock = { type: 'tool_result', tool_use_id: message.toolCallId, content: message.content }
      const last = result[result.length - 1]
      if (last && last.role === 'user' && Array.isArray(last.content)) last.content.push(block)
      else result.push({ role: 'user', content: [block] })
    }
  }
  return result
}

const anthropicAdapter: LlmUpstreamAdapter = {
  buildRequest: (config, systemPrompt, messages, tools) => ({
    url: config.baseUrl + '/v1/messages',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: {
      model: config.model,
      system: systemPrompt,
      max_tokens: 16_000,
      messages: toAnthropicMessages(messages),
      tools: tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      })),
      tool_choice: { type: 'auto' },
      ...(config.thinking
        ? { thinking: { type: 'enabled', budget_tokens: ANTHROPIC_THINKING_BUDGETS[config.thinking] } }
        : {}),
    },
  }),

  parseResponse(payload) {
    const content = (payload as { content?: unknown })?.content
    if (!Array.isArray(content)) throw new HttpError(502, 'llm_invalid_response', 'LLM returned no completion')
    const texts: string[] = []
    const thinkingTexts: string[] = []
    let thinkingSignature: string | undefined
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = []
    for (const raw of content) {
      const block = raw as { type?: unknown; text?: unknown; thinking?: unknown; signature?: unknown; id?: unknown; name?: unknown; input?: unknown }
      if (block.type === 'text' && typeof block.text === 'string') {
        texts.push(block.text)
      } else if (block.type === 'thinking') {
        if (typeof block.thinking === 'string') thinkingTexts.push(block.thinking)
        // 签名随最后一块走，回传历史时原样带回
        if (typeof block.signature === 'string') thinkingSignature = block.signature
      } else if (block.type === 'tool_use') {
        if (typeof block.id !== 'string') invalidToolCall()
        assertToolName(block.name)
        toolCalls.push({ id: block.id, name: block.name as string, arguments: JSON.stringify(block.input ?? {}) })
      }
    }
    const reasoningContent = thinkingTexts.join('')
    return AdeAgentTurnResponseSchema.parse({
      message: {
        content: texts.join(''),
        toolCalls,
        ...(reasoningContent ? { reasoningContent } : {}),
        ...(thinkingSignature ? { reasoningSignature: thinkingSignature } : {}),
      },
    })
  },
}

/* --------------------------------- 入口 --------------------------------- */

const ADAPTERS: Record<LlmProvider, LlmUpstreamAdapter> = {
  'openai-chat': openaiChatAdapter,
  'openai-responses': openaiResponsesAdapter,
  anthropic: anthropicAdapter,
}

export function getAdapter(provider: LlmProvider): LlmUpstreamAdapter {
  return ADAPTERS[provider]
}

/** 测试连接用的最小请求：一条 user 消息、极小 token 预算、不带工具。 */
export function buildPingRequest(config: ResolvedLlmConfig): LlmUpstreamRequest {
  switch (config.provider) {
    case 'openai-chat':
      return {
        url: config.baseUrl + '/chat/completions',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.apiKey },
        body: { model: config.model, max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] },
      }
    case 'openai-responses':
      return {
        url: config.baseUrl + '/responses',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.apiKey },
        body: { model: config.model, input: [{ role: 'user', content: 'ping' }], max_output_tokens: 16 },
      }
    case 'anthropic':
      return {
        url: config.baseUrl + '/v1/messages',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: { model: config.model, max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] },
      }
  }
}
