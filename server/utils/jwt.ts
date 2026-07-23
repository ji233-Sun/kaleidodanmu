import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'

/**
 * HS256 JWT 会话令牌：登录 / 注册时签发，放入 HttpOnly cookie。
 * 无状态——服务端不存会话，logout 只清 cookie，令牌在 exp 前仍有效。
 */

export const SESSION_TTL_S = 60 * 60 * 24 * 30 // 30 天，与 cookie Max-Age 对齐

export interface SessionClaims {
  /** 用户 id */
  sub: number
  iat: number
  exp: number
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function sign(data: string): Buffer {
  return createHmac('sha256', env.sessionSecret).update(data).digest()
}

/** 签发会话 JWT；ttlSeconds 仅供测试注入过期场景。 */
export function signSessionToken(userId: number, ttlSeconds = SESSION_TTL_S): string {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ sub: userId, iat: now, exp: now + ttlSeconds }))
  return `${header}.${payload}.${sign(`${header}.${payload}`).toString('base64url')}`
}

/** 校验签名与有效期；任何不合法都返回 null（不抛出，按未登录处理）。 */
export function verifySessionToken(token: string): SessionClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts

  // 固定 HS256，防 alg 混淆
  try {
    const { alg } = JSON.parse(Buffer.from(header, 'base64url').toString())
    if (alg !== 'HS256') return null
  } catch {
    return null
  }

  const expected = sign(`${header}.${payload}`)
  const actual = Buffer.from(sig, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionClaims
    if (typeof claims.sub !== 'number' || typeof claims.exp !== 'number') return null
    if (claims.exp * 1000 <= Date.now()) return null
    return claims
  } catch {
    return null
  }
}
