import type { NextResponse } from 'next/server'

export const SESSION_COOKIE = 'kaleido_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 天

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function setSessionCookie(res: NextResponse, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.headers.append(
    'set-cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax${secure}`,
  )
}

export function clearSessionCookie(res: NextResponse): void {
  res.headers.append(
    'set-cookie',
    `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
  )
}
