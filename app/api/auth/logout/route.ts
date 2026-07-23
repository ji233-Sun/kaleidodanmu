import { NextResponse } from 'next/server'
import { handleApiError, requireUser, readCookie, SESSION_COOKIE, clearSessionCookie } from '@/server/utils/http'
import { AuthService } from '@/server/services/auth.service'

export async function POST(req: Request) {
  try {
    await requireUser(req)
    const token = readCookie(req, SESSION_COOKIE)
    await AuthService.logout(token)
    const res = NextResponse.json({ ok: true })
    clearSessionCookie(res)
    return res
  } catch (e) {
    return handleApiError(e)
  }
}
