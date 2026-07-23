import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { HttpError } from './errors'
import { readCookie, SESSION_COOKIE } from './cookies'
import { verifySessionToken } from './jwt'
import { UserRepository } from '@/server/repositories/user.repository'
import { ApiTokenRepository } from '@/server/repositories/apiToken.repository'
import type { User } from '@/server/database/entities/user.entity'

export { SESSION_COOKIE, readCookie, setSessionCookie, clearSessionCookie } from './cookies'
export { HttpError } from './errors'

/** 统一的 JSON 错误响应。 */
export function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}

/**
 * 解析当前用户：优先会话 cookie（JWT），其次 `Authorization: Bearer kdt_*`（CLI 的 API token）。
 * 未登录、签名无效、令牌吊销或过期均返回 null。
 */
export async function getCurrentUser(req: Request): Promise<User | null> {
  const token = readCookie(req, SESSION_COOKIE)
  if (token) {
    const claims = verifySessionToken(token)
    if (claims) return UserRepository.findById(claims.sub)
  }

  const bearer = req.headers.get('authorization')
  if (bearer?.startsWith('Bearer kdt_')) {
    const tokenHash = createHash('sha256').update(bearer.slice('Bearer '.length)).digest('hex')
    const apiToken = await ApiTokenRepository.findByTokenHash(tokenHash)
    if (!apiToken || apiToken.revokedAt) return null
    if (apiToken.expiresAt && apiToken.expiresAt.getTime() <= Date.now()) return null
    return UserRepository.findById(apiToken.userId)
  }
  return null
}

/** 需要登录：未登录抛 401，由 handleApiError 捕获。 */
export async function requireUser(req: Request): Promise<User> {
  const user = await getCurrentUser(req)
  if (!user) throw new HttpError(401, 'unauthorized', 'Authentication required')
  return user
}

/** 把 service 抛出的异常转成 HTTP 响应：HttpError / ZodError / 兜底 500。 */
export function handleApiError(e: unknown): NextResponse {
  if (e instanceof HttpError) return apiError(e.status, e.code, e.message)
  if (e instanceof ZodError) return apiError(400, 'invalid_request', JSON.stringify(e.issues))
  console.error('[api] unhandled error', e)
  return apiError(500, 'internal_error', 'Internal server error')
}
