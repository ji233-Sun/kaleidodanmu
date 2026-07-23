import { z } from 'zod'

/** 目前只认官方 CLI 这一个 client；第三方 client 注册体系后续再做。 */
export const CLI_CLIENT_ID = 'kaleido-cli'

/** 授权 scope 目录：授权页展示文案与服务端白名单校验共用，避免漂移。 */
export const SCOPE_CATALOG: Record<string, string> = {
  'profile:read': '读取你的基本资料（昵称、头像）',
  'effects:read': '查看你的万花筒作品',
  'effects:write': '创建、修改和删除你的万花筒作品',
  'square:publish': '将作品发布到万花筒广场',
}

/** CLI login 默认申请全部 scope。 */
export const DEFAULT_CLI_SCOPES = Object.keys(SCOPE_CATALOG)

export const AuthorizeRequestSchema = z.object({
  clientId: z.literal(CLI_CLIENT_ID),
  redirectUri: z.url(),
  scopes: z.array(z.string()).min(1),
  codeChallenge: z.string().min(43).max(128),
  codeChallengeMethod: z.literal('S256'),
})
export type AuthorizeRequest = z.infer<typeof AuthorizeRequestSchema>

export interface AuthorizeResponse {
  /** 一次性授权码，明文只返回这一次（库里只存哈希） */
  code: string
}

export const TokenRequestSchema = z.object({
  grantType: z.literal('authorization_code'),
  clientId: z.literal(CLI_CLIENT_ID),
  code: z.string().min(1),
  redirectUri: z.url(),
  codeVerifier: z.string().min(43).max(128),
})
export type TokenRequest = z.infer<typeof TokenRequestSchema>

/** RFC 6749 token 响应。 */
export interface OAuthTokenResponse {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  scope: string
}
