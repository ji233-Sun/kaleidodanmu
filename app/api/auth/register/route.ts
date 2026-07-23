import { NextResponse } from 'next/server'
import { handleApiError, setSessionCookie } from '@/server/utils/http'
import { AuthService } from '@/server/services/auth.service'
import { RegisterSchema } from '@/types'

export async function POST(req: Request) {
  try {
    const body = RegisterSchema.parse(await req.json())
    const { user, token } = await AuthService.register(body.email, body.password)
    const res = NextResponse.json({ user }, { status: 201 })
    setSessionCookie(res, token)
    return res
  } catch (e) {
    return handleApiError(e)
  }
}
