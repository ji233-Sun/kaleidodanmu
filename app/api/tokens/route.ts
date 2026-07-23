import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { TokenService } from '@/server/services/token.service'
import { CreateTokenSchema } from '@/types'

export async function GET(req: Request) {
  try {
    const user = await requireUser(req)
    const tokens = await TokenService.list(user.id)
    return NextResponse.json({ tokens })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req)
    const body = CreateTokenSchema.parse(await req.json())
    const token = await TokenService.create(user.id, body.scopes, body.expiresInDays)
    return NextResponse.json({ token }, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
