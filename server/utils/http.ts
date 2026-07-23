import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { HttpError } from './errors'
import { readCookie, SESSION_COOKIE } from './cookies'
import { verifySessionToken } from './jwt'
import { UserRepository } from '@/server/repositories/user.repository'
import type { User } from '@/server/database/entities/user.entity'

export { SESSION_COOKIE, readCookie, setSessionCookie, clearSessionCookie } from './cookies'
export { HttpError } from './errors'

/** 统一的 JSON 错误响应。 */
export function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}

/** 读取会话 cookie（JWT）解析当前用户；未登录、签名无效或过期返回 null。 */
export async function getCurrentUser(req: Request): Promise<User | null> {
  const token = readCookie(req, SESSION_COOKIE)
  if (!token) return null
  const claims = verifySessionToken(token)
  if (!claims) return null
  return UserRepository.findById(claims.sub)
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
