import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { toAuthUser } from '@/server/services/auth.service'

export async function GET(req: Request) {
  try {
    const user = await requireUser(req)
    return NextResponse.json({ user: toAuthUser(user) })
  } catch (e) {
    return handleApiError(e)
  }
}
