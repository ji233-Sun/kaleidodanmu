import { z } from 'zod'

/**
 * ADE 会话快照载荷：聊天消息 + 浏览器虚拟工程文件。
 * 服务端仅做结构校验，内容（中文长度、源码字节）由调用方/上游决定。
 *
 * 消息除用户/助手文本外，还包含 Agent 工作过程：
 * - reasoning：模型的思考摘要（DeepSeek reasoning_content），前端折叠展示
 * - tool：一次浏览器内工具调用（read_file/write_file/validate/refresh_preview），
 *   status 为 running 的消息只会出现在生成进行中；刷新恢复时应视为已中断。
 */
export const AdeChatMessageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), text: z.string() }).strict(),
  z.object({ role: z.literal('assistant'), text: z.string() }).strict(),
  z.object({ role: z.literal('reasoning'), text: z.string().max(4000) }).strict(),
  z
    .object({
      role: z.literal('tool'),
      name: z.enum(['read_file', 'write_file', 'validate', 'refresh_preview']),
      summary: z.string().max(200),
      status: z.enum(['running', 'ok', 'error']),
      detail: z.string().max(2000).optional(),
    })
    .strict(),
])
export type AdeChatMessage = z.infer<typeof AdeChatMessageSchema>

export const AdeSessionPayloadSchema = z.object({
  messages: z.array(AdeChatMessageSchema).max(500),
  files: z.object({
    'effect.json': z.string(),
    'index.ts': z.string(),
  }),
})
export type AdeSessionPayload = z.infer<typeof AdeSessionPayloadSchema>

export const SaveAdeSessionSchema = z.object({
  payload: AdeSessionPayloadSchema,
})
export type SaveAdeSessionRequest = z.infer<typeof SaveAdeSessionSchema>

export interface AdeSessionDto {
  targetKey: string
  payload: AdeSessionPayload
  updatedAt: string
}
