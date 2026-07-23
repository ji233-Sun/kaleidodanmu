import { NextResponse } from 'next/server'
import { handleApiError, requireUser, clearSessionCookie } from '@/server/utils/http'

// JWT 无状态：logout 只清 cookie，令牌本身在 exp 前仍有效
export async function POST(req: Request) {
  try {
    await requireUser(req)
    const res = NextResponse.json({ ok: true })
    clearSessionCookie(res)
    return res
  } catch (e) {
    return handleApiError(e)
  }
}
