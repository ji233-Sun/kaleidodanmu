import { z } from 'zod'

/**
 * ADE 会话快照载荷：聊天消息 + 浏览器虚拟工程文件。
 * 服务端仅做结构校验，内容（中文长度、源码字节）由调用方/上游决定。
 */
export const AdeChatMessageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), text: z.string() }).strict(),
  z.object({ role: z.literal('assistant'), text: z.string() }).strict(),
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
