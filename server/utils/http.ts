import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { HttpError } from './errors'
import { readCookie, SESSION_COOKIE } from './cookies'
import { SessionRepository } from '@/server/repositories/session.repository'
import { UserRepository } from '@/server/repositories/user.repository'
import type { User } from '@/server/database/entities/user.entity'

export { SESSION_COOKIE, readCookie, setSessionCookie, clearSessionCookie } from './cookies'
export { HttpError } from './errors'

/** 统一的 JSON 错误响应。 */
export function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}

/** 读取会话 cookie 解析当前用户；未登录或会话过期返回 null。 */
export async function getCurrentUser(req: Request): Promise<User | null> {
  const token = readCookie(req, SESSION_COOKIE)
  if (!token) return null
  const session = await SessionRepository.findByToken(token)
  if (!session || session.expiresAt.getTime() < Date.now()) return null
  return UserRepository.findById(session.userId)
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
