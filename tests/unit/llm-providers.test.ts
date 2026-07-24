import { describe, it, expect } from 'vitest'
import { getAdapter, buildPingRequest, type LlmToolSpec } from '@/server/services/llm/providers'
import type { ResolvedLlmConfig } from '@/server/services/llmConfig.service'
import type { AdeAgentMessage } from '@/lib/ade/protocol'

const SYSTEM_PROMPT = 'test system prompt'

const TOOLS: LlmToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
]

/** 覆盖三种消息形态的一轮对话。 */
const MESSAGES: AdeAgentMessage[] = [
  { role: 'user', content: '做一个粒子效果' },
  {
    role: 'assistant',
    content: '先读取文件',
    toolCalls: [{ id: 'call_1', name: 'read_file', arguments: '{"path":"GUIDE.md"}' }],
    reasoningContent: '需要先了解 SDK',
  },
  { role: 'tool', toolCallId: 'call_1', content: '...guide...' },
]

function config(provider: ResolvedLlmConfig['provider'], thinking?: ResolvedLlmConfig['thinking']): ResolvedLlmConfig {
  return { provider, baseUrl: 'https://up.example.com/v1', apiKey: 'sk-user-key', model: 'test-model', ...(thinking ? { thinking } : {}) }
}

describe('openai-chat adapter', () => {
  it('buildRequest 命中 /chat/completions，Bearer 头与消息/tools 原样透传', () => {
    const req = getAdapter('openai-chat').buildRequest(config('openai-chat'), SYSTEM_PROMPT, MESSAGES, TOOLS)
    expect(req.url).toBe('https://up.example.com/v1/chat/completions')
    expect(req.headers.authorization).toBe('Bearer sk-user-key')
    const body = req.body as {
      model: string
      messages: Array<Record<string, unknown>>
      tools: unknown
      tool_choice: string
    }
    expect(body.model).toBe('test-model')
    expect(body.tools).toBe(TOOLS)
    expect(body.tool_choice).toBe('auto')
    expect(body.messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT })
    expect(body.messages[1]).toEqual({ role: 'user', content: '做一个粒子效果' })
    // assistant 的 tool_calls / reasoning_content 原样保留
    expect(body.messages[2]).toMatchObject({
      role: 'assistant',
      reasoning_content: '需要先了解 SDK',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"GUIDE.md"}' } }],
    })
    expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '...guide...' })
  })

  it('parseResponse 解析 content / tool_calls / reasoning_content', () => {
    const res = getAdapter('openai-chat').parseResponse({
      choices: [
        {
          message: {
            content: '好的',
            reasoning_content: '想了一下',
            tool_calls: [{ id: 'c1', function: { name: 'validate', arguments: '{}' } }],
          },
        },
      ],
    })
    expect(res.message.content).toBe('好的')
    expect(res.message.reasoningContent).toBe('想了一下')
    expect(res.message.toolCalls).toEqual([{ id: 'c1', name: 'validate', arguments: '{}' }])
  })

  it('parseResponse 遇到未知 tool 名抛 llm_invalid_response', () => {
    expect(() =>
      getAdapter('openai-chat').parseResponse({
        choices: [{ message: { content: '', tool_calls: [{ id: 'c1', function: { name: 'exec_shell', arguments: '{}' } }] } }],
      }),
    ).toThrowError(expect.objectContaining({ status: 502, code: 'llm_invalid_response' }))
  })

  it('parseResponse 兼容 reasoning 键（OpenRouter / GLM 风格）', () => {
    const res = getAdapter('openai-chat').parseResponse({
      choices: [{ message: { content: '好', reasoning: '想了一下' } }],
    })
    expect(res.message.reasoningContent).toBe('想了一下')
  })

  it('DeepSeek 工具续轮保留空 reasoning_content 字段', () => {
    const parsed = getAdapter('openai-chat').parseResponse({
      choices: [
        {
          message: {
            content: null,
            reasoning_content: '',
            tool_calls: [{ id: 'c1', function: { name: 'validate', arguments: '{}' } }],
          },
        },
      ],
    })
    expect(parsed.message.reasoningContent).toBe('')

    const req = getAdapter('openai-chat').buildRequest(
      config('openai-chat', 'high'),
      SYSTEM_PROMPT,
      [
        { role: 'user', content: '继续' },
        {
          role: 'assistant',
          content: '',
          reasoningContent: parsed.message.reasoningContent,
          toolCalls: parsed.message.toolCalls,
        },
        { role: 'tool', toolCallId: 'c1', content: '校验通过' },
      ],
      TOOLS,
    )
    const body = req.body as { messages: Array<Record<string, unknown>> }
    expect(body.messages[2]).toHaveProperty('reasoning_content', '')
  })

  it('官方 DeepSeek thinking 使用 V4 工具兼容请求形状', () => {
    const req = getAdapter('openai-chat').buildRequest(
      {
        provider: 'openai-chat',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-deepseek',
        model: 'deepseek-v4-flash',
        thinking: 'high',
      },
      SYSTEM_PROMPT,
      [
        { role: 'user', content: '继续' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'c1', name: 'validate', arguments: '{}' }],
        },
        { role: 'tool', toolCallId: 'c1', content: '校验通过' },
      ],
      TOOLS,
    )
    const body = req.body as { messages: Array<Record<string, unknown>> }
    expect(body).toMatchObject({
      reasoning_effort: 'high',
      thinking: { type: 'enabled' },
    })
    expect(body).not.toHaveProperty('tool_choice')
    expect(body.messages[2]).toMatchObject({
      role: 'assistant',
      content: '.',
      reasoning_content: '',
    })
  })

  it('非官方 OpenAI-compatible 服务不套用 DeepSeek V4 方言', () => {
    const req = getAdapter('openai-chat').buildRequest(
      {
        provider: 'openai-chat',
        baseUrl: 'https://gateway.example.com/v1',
        apiKey: 'sk-gateway',
        model: 'deepseek-v4-flash',
        thinking: 'high',
      },
      SYSTEM_PROMPT,
      [{ role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'validate', arguments: '{}' }] }],
      TOOLS,
    )
    const body = req.body as { messages: Array<Record<string, unknown>> }
    expect(body).toHaveProperty('tool_choice', 'auto')
    expect(body).not.toHaveProperty('thinking')
    expect(body.messages[1]).toMatchObject({ content: null })
    expect(body.messages[1]).not.toHaveProperty('reasoning_content')
  })
})

describe('openai-responses adapter', () => {
  it('buildRequest 命中 /responses，instructions + 扁平 tools + function_call 输入项', () => {
    const req = getAdapter('openai-responses').buildRequest(config('openai-responses'), SYSTEM_PROMPT, MESSAGES, TOOLS)
    expect(req.url).toBe('https://up.example.com/v1/responses')
    expect(req.headers.authorization).toBe('Bearer sk-user-key')
    const body = req.body as {
      model: string
      instructions: string
      input: Array<Record<string, unknown>>
      tools: Array<Record<string, unknown>>
      max_output_tokens: number
    }
    expect(body.model).toBe('test-model')
    expect(body.instructions).toBe(SYSTEM_PROMPT)
    expect(body.tools).toEqual([
      { type: 'function', name: 'read_file', description: 'Read a file.', parameters: TOOLS[0].function.parameters },
    ])
    expect(body.max_output_tokens).toBe(16_000)
    expect(body.input[0]).toEqual({ role: 'user', content: '做一个粒子效果' })
    expect(body.input).toContainEqual({ role: 'assistant', content: '先读取文件' })
    expect(body.input).toContainEqual({ type: 'function_call', call_id: 'call_1', name: 'read_file', arguments: '{"path":"GUIDE.md"}' })
    expect(body.input).toContainEqual({ type: 'function_call_output', call_id: 'call_1', output: '...guide...' })
  })

  it('parseResponse 从 output[] 提取 output_text 与 function_call', () => {
    const res = getAdapter('openai-responses').parseResponse({
      output: [
        { type: 'message', content: [{ type: 'output_text', text: '写入文件' }] },
        { type: 'function_call', call_id: 'c9', name: 'refresh_preview', arguments: '{}' },
      ],
    })
    expect(res.message.content).toBe('写入文件')
    expect(res.message.toolCalls).toEqual([{ id: 'c9', name: 'refresh_preview', arguments: '{}' }])
  })

  it('parseResponse 遇到未知 tool 名抛 llm_invalid_response', () => {
    expect(() =>
      getAdapter('openai-responses').parseResponse({
        output: [{ type: 'function_call', call_id: 'c9', name: 'hack', arguments: '{}' }],
      }),
    ).toThrowError(expect.objectContaining({ status: 502, code: 'llm_invalid_response' }))
  })
})

describe('anthropic adapter', () => {
  it('buildRequest 命中 /v1/messages，x-api-key 头 + tool_use/tool_result 互转', () => {
    const req = getAdapter('anthropic').buildRequest(config('anthropic'), SYSTEM_PROMPT, MESSAGES, TOOLS)
    expect(req.url).toBe('https://up.example.com/v1/v1/messages')
    expect(req.headers['x-api-key']).toBe('sk-user-key')
    expect(req.headers['anthropic-version']).toBe('2023-06-01')
    const body = req.body as {
      model: string
      system: string
      max_tokens: number
      messages: Array<{ role: string; content: unknown }>
      tools: Array<Record<string, unknown>>
      tool_choice: unknown
    }
    expect(body.model).toBe('test-model')
    expect(body.system).toBe(SYSTEM_PROMPT)
    expect(body.max_tokens).toBe(16_000)
    expect(body.tool_choice).toEqual({ type: 'auto' })
    expect(body.tools).toEqual([{ name: 'read_file', description: 'Read a file.', input_schema: TOOLS[0].function.parameters }])
    expect(body.messages[0]).toEqual({ role: 'user', content: '做一个粒子效果' })
    // assistant toolCalls → tool_use content block（arguments 反序列化为 input）
    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: '先读取文件' },
        { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'GUIDE.md' } },
      ],
    })
    // tool 结果并入 user 消息的 tool_result block
    expect(body.messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '...guide...' }],
    })
  })

  it('parseResponse 拼接 text block 并解析 tool_use', () => {
    const res = getAdapter('anthropic').parseResponse({
      content: [
        { type: 'text', text: '你好' },
        { type: 'text', text: '世界' },
        { type: 'tool_use', id: 'tu_1', name: 'write_file', input: { path: 'index.ts', content: 'code' } },
      ],
    })
    expect(res.message.content).toBe('你好世界')
    expect(res.message.toolCalls).toEqual([
      { id: 'tu_1', name: 'write_file', arguments: '{"path":"index.ts","content":"code"}' },
    ])
  })

  it('parseResponse 遇到未知 tool 名抛 llm_invalid_response', () => {
    expect(() =>
      getAdapter('anthropic').parseResponse({
        content: [{ type: 'tool_use', id: 'tu_1', name: 'rm_rf', input: {} }],
      }),
    ).toThrowError(expect.objectContaining({ status: 502, code: 'llm_invalid_response' }))
  })
})

describe('思考深度（thinking）', () => {
  it('openai-chat：设置档位时带 reasoning_effort 且不带 temperature；默认时相反', () => {
    const on = getAdapter('openai-chat').buildRequest(config('openai-chat', 'high'), SYSTEM_PROMPT, MESSAGES, TOOLS)
    expect(on.body).toMatchObject({ reasoning_effort: 'high' })
    expect(on.body).not.toHaveProperty('temperature')

    const off = getAdapter('openai-chat').buildRequest(config('openai-chat'), SYSTEM_PROMPT, MESSAGES, TOOLS)
    expect(off.body).toMatchObject({ temperature: 0.2 })
    expect(off.body).not.toHaveProperty('reasoning_effort')
  })

  it('openai-responses：设置档位时带 reasoning.effort；默认不带', () => {
    const on = getAdapter('openai-responses').buildRequest(config('openai-responses', 'low'), SYSTEM_PROMPT, MESSAGES, TOOLS)
    expect(on.body).toMatchObject({ reasoning: { effort: 'low' } })

    const off = getAdapter('openai-responses').buildRequest(config('openai-responses'), SYSTEM_PROMPT, MESSAGES, TOOLS)
    expect(off.body).not.toHaveProperty('reasoning')
  })

  it('openai-responses：parseResponse 捕获 reasoning 摘要为 reasoningContent', () => {
    const res = getAdapter('openai-responses').parseResponse({
      output: [
        { type: 'reasoning', summary: [{ type: 'summary_text', text: '推理过程' }] },
        { type: 'message', content: [{ type: 'output_text', text: '完成' }] },
      ],
    })
    expect(res.message.reasoningContent).toBe('推理过程')
    expect(res.message.content).toBe('完成')
  })

  it('anthropic：档位映射为 thinking.budget_tokens；默认不带 thinking', () => {
    const bodyOf = (level?: ResolvedLlmConfig['thinking']) =>
      getAdapter('anthropic').buildRequest(config('anthropic', level), SYSTEM_PROMPT, MESSAGES, TOOLS).body as {
        max_tokens: number
        thinking?: { type: string; budget_tokens: number }
      }
    expect(bodyOf('low').thinking).toEqual({ type: 'enabled', budget_tokens: 1024 })
    expect(bodyOf('medium').thinking).toEqual({ type: 'enabled', budget_tokens: 4096 })
    expect(bodyOf('high').thinking).toEqual({ type: 'enabled', budget_tokens: 12_000 })
    expect(bodyOf().thinking).toBeUndefined()
    // budget 必须小于 max_tokens
    expect(bodyOf('high').thinking!.budget_tokens).toBeLessThan(bodyOf('high').max_tokens)
  })

  it('anthropic：parseResponse 捕获 thinking 块文本与签名', () => {
    const res = getAdapter('anthropic').parseResponse({
      content: [
        { type: 'thinking', thinking: '先分析需求', signature: 'sig-abc' },
        { type: 'text', text: '好的' },
      ],
    })
    expect(res.message.reasoningContent).toBe('先分析需求')
    expect(res.message.reasoningSignature).toBe('sig-abc')
  })

  it('anthropic：带签名的思考块作为首个 block 回传给上游', () => {
    const history: AdeAgentMessage[] = [
      { role: 'user', content: '改一下' },
      {
        role: 'assistant',
        content: '先读文件',
        toolCalls: [{ id: 'call_1', name: 'read_file', arguments: '{"path":"GUIDE.md"}' }],
        reasoningContent: '先分析需求',
        reasoningSignature: 'sig-abc',
      },
      { role: 'tool', toolCallId: 'call_1', content: '...guide...' },
    ]
    const req = getAdapter('anthropic').buildRequest(config('anthropic', 'medium'), SYSTEM_PROMPT, history, TOOLS)
    const body = req.body as { messages: Array<{ role: string; content: unknown }> }
    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '先分析需求', signature: 'sig-abc' },
        { type: 'text', text: '先读文件' },
        { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'GUIDE.md' } },
      ],
    })
  })
})

describe('buildPingRequest', () => {
  it('三个协议都是最小请求（max_tokens 16、无 tools、user ping）', () => {
    const chat = buildPingRequest(config('openai-chat'))
    expect(chat.url).toBe('https://up.example.com/v1/chat/completions')
    expect(chat.body).toMatchObject({ model: 'test-model', max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] })

    const responses = buildPingRequest(config('openai-responses'))
    expect(responses.url).toBe('https://up.example.com/v1/responses')
    expect(responses.body).toMatchObject({ model: 'test-model', max_output_tokens: 16 })

    const anthropic = buildPingRequest(config('anthropic'))
    expect(anthropic.url).toBe('https://up.example.com/v1/v1/messages')
    expect(anthropic.headers['x-api-key']).toBe('sk-user-key')
    expect(anthropic.body).toMatchObject({ model: 'test-model', max_tokens: 16 })
  })
})
