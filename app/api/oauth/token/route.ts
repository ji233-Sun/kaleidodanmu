import { NextResponse } from 'next/server'
import { handleApiError } from '@/server/utils/http'
import { OAuthService } from '@/server/services/oauth.service'
import { TokenRequestSchema } from '@/types'

export async function POST(req: Request) {
  try {
    const body = TokenRequestSchema.parse(await req.json())
    const token = await OAuthService.exchangeCode(body)
    return NextResponse.json(token)
  } catch (e) {
    return handleApiError(e)
  }
}
