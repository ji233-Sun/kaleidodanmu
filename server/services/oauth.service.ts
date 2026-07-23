import { createHash, timingSafeEqual } from 'node:crypto'
import { OAuthCodeRepository } from '@/server/repositories/oauthCode.repository'
import { TokenService } from '@/server/services/token.service'
import { randomToken } from '@/server/utils/crypto'
import { HttpError } from '@/server/utils/errors'
import { SCOPE_CATALOG, type AuthorizeRequest, type OAuthTokenResponse, type TokenRequest } from '@/types'

const CODE_TTL_MS = 1000 * 60 * 5 // 授权码 5 分钟有效

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function invalidGrant(message: string): HttpError {
  return new HttpError(400, 'invalid_grant', message)
}

/** CLI 回调只允许 loopback http 地址（任意端口），防开放重定向。 */
function assertLoopbackRedirect(redirectUri: string): void {
  let url: URL
  try {
    url = new URL(redirectUri)
  } catch {
    throw new HttpError(400, 'invalid_redirect_uri', 'redirect_uri is not a valid URL')
  }
  const host = url.hostname
  const loopback = host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
  if (url.protocol !== 'http:' || !loopback) {
    throw new HttpError(400, 'invalid_redirect_uri', 'redirect_uri must be an http loopback URL (127.0.0.1 / localhost)')
  }
}

function assertScopes(scopes: string[]): void {
  const unknown = scopes.filter((s) => !(s in SCOPE_CATALOG))
  if (unknown.length > 0) {
    throw new HttpError(400, 'invalid_scope', `Unknown scopes: ${unknown.join(', ')}`)
  }
}

export const OAuthService = {
  /** 已登录用户同意授权后签发一次性授权码；明文只返回这一次。 */
  async issueCode(userId: number, req: AuthorizeRequest): Promise<string> {
    assertLoopbackRedirect(req.redirectUri)
    assertScopes(req.scopes)
    const code = `kdc_${randomToken(32)}`
    await OAuthCodeRepository.create({
      userId,
      codeHash: hashCode(code),
      clientId: req.clientId,
      redirectUri: req.redirectUri,
      scopes: JSON.stringify(req.scopes),
      codeChallenge: req.codeChallenge,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    })
    return code
  },

  /** 授权码 + PKCE verifier 换 API 访问令牌。 */
  async exchangeCode(req: TokenRequest): Promise<OAuthTokenResponse> {
    const row = await OAuthCodeRepository.findByCodeHash(hashCode(req.code))
    if (!row) throw invalidGrant('Unknown authorization code')
    if (row.usedAt) throw invalidGrant('Authorization code already used')
    if (row.expiresAt.getTime() <= Date.now()) throw invalidGrant('Authorization code expired')
    if (row.clientId !== req.clientId || row.redirectUri !== req.redirectUri) {
      throw invalidGrant('client_id / redirect_uri mismatch')
    }

    // PKCE S256：sha256(verifier) 的 base64url 须与授权时的 challenge 一致
    const computed = createHash('sha256').update(req.codeVerifier).digest('base64url')
    const expected = Buffer.from(row.codeChallenge, 'base64url')
    const actual = Buffer.from(computed, 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw invalidGrant('PKCE verification failed')
    }

    await OAuthCodeRepository.markUsed(row.id)
    const scopes = row.scopes ? (JSON.parse(row.scopes) as string[]) : []
    const token = await TokenService.create(row.userId, scopes)
    return {
      access_token: token.token,
      token_type: 'Bearer',
      expires_in: token.expiresAt
        ? Math.max(0, Math.floor((new Date(token.expiresAt).getTime() - Date.now()) / 1000))
        : 0,
      scope: scopes.join(' '),
    }
  },
}
