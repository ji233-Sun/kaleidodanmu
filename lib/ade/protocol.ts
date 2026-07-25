import { z } from 'zod'

/** LLM 只能调用这组浏览器内工具；服务端不会执行其中任何一个。 */
export const ADE_TOOL_NAMES = ['read_file', 'write_file', 'validate', 'refresh_preview'] as const
export type AdeToolName = (typeof ADE_TOOL_NAMES)[number]

const ToolCallSchema = z
  .object({
    id: z.string().min(1),
    name: z.enum(ADE_TOOL_NAMES),
    arguments: z.string(),
  })
  .strict()

const AgentMessageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: z.string().trim().min(1) }).strict(),
  z
    .object({
      role: z.literal('assistant'),
      content: z.string(),
      toolCalls: z.array(ToolCallSchema).max(4),
      reasoningContent: z.string().optional(),
      // Anthropic 思考块的签名：开启 thinking 后回传历史时必须原样带回，否则上游 400
      reasoningSignature: z.string().optional(),
    })
    .strict(),
  z
    .object({
      role: z.literal('tool'),
      toolCallId: z.string().min(1),
      content: z.string(),
    })
    .strict(),
])

/**
 * 单轮请求的消息条数上限。这不是 Agent 的轮次限制：浏览器端循环不限轮次，
 * 靠滑动窗口把每次请求控制在该容量内；此处只是代理转发的防滥用天花板。
 */
export const ADE_MAX_TURN_MESSAGES = 64

/**
 * 每次请求只承载一个用户意图和该轮工具回执，不能作为任意多轮聊天 API 使用。
 * Agent 的工程状态保留在浏览器虚拟文件系统，不从服务端读取。
 */
export const AdeAgentTurnRequestSchema = z
  .object({ messages: z.array(AgentMessageSchema).min(1).max(ADE_MAX_TURN_MESSAGES) })
  .strict()
  .superRefine(({ messages }, ctx) => {
    if (messages[0]?.role !== 'user') {
      ctx.addIssue({ code: 'custom', message: 'The first message must be the design instruction' })
    }
    if (messages.filter((message) => message.role === 'user').length !== 1) {
      ctx.addIssue({ code: 'custom', message: 'Exactly one design instruction is allowed per turn' })
    }
  })

export const AdeAgentTurnResponseSchema = z
  .object({
    message: z
      .object({
        content: z.string(),
        toolCalls: z.array(ToolCallSchema).max(4),
        reasoningContent: z.string().optional(),
        reasoningSignature: z.string().optional(),
      })
      .strict(),
  })
  .strict()

/**
 * 滑动上下文窗口：保留首条 user 指令，超限时整体丢弃最早的 assistant+tool 组。
 * 必须在 assistant 边界下刀，否则会产生孤儿 tool 消息（上游对没有 toolCalls
 * 父消息的 tool 回执直接 400）。工程状态在浏览器文件里，模型可随时 read_file 找回上下文。
 */
export function trimTurnMessages(messages: AdeAgentMessage[]): void {
  while (messages.length > ADE_MAX_TURN_MESSAGES && messages.length > 1) {
    let next = 2 // messages[0] 是 user，messages[1] 是最早一组的 assistant
    while (next < messages.length && messages[next].role === 'tool') next += 1
    messages.splice(1, next - 1)
  }
}

export type AdeAgentMessage = z.infer<typeof AgentMessageSchema>
export type AdeAgentTurnResponse = z.infer<typeof AdeAgentTurnResponseSchema>
export type AdeToolCall = z.infer<typeof ToolCallSchema>
