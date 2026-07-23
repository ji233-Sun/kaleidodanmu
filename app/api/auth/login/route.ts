import { NextResponse } from 'next/server'
import { handleApiError, setSessionCookie } from '@/server/utils/http'
import { AuthService } from '@/server/services/auth.service'
import { LoginSchema } from '@/types'

export async function POST(req: Request) {
  try {
    const body = LoginSchema.parse(await req.json())
    const { user, token } = await AuthService.login(body.email, body.password)
    const res = NextResponse.json({ user })
    setSessionCookie(res, token)
    return res
  } catch (e) {
    return handleApiError(e)
  }
}
