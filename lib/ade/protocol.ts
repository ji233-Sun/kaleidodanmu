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
 * 每次请求只承载一个用户意图和该轮工具回执，不能作为任意多轮聊天 API 使用。
 * Agent 的工程状态保留在浏览器虚拟文件系统，不从服务端读取。
 */
export const AdeAgentTurnRequestSchema = z
  .object({ messages: z.array(AgentMessageSchema).min(1).max(14) })
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
      })
      .strict(),
  })
  .strict()

export type AdeAgentMessage = z.infer<typeof AgentMessageSchema>
export type AdeAgentTurnResponse = z.infer<typeof AdeAgentTurnResponseSchema>
export type AdeToolCall = z.infer<typeof ToolCallSchema>
