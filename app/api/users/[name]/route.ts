import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/server/utils/http'
import { UserService } from '@/server/services/user.service'

type Ctx = { params: Promise<{ name: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { name } = await params
    const profile = await UserService.getProfile(decodeURIComponent(name))
    if (!profile) throw new HttpError(404, 'not_found', 'User not found')
    return NextResponse.json(profile)
  } catch (e) {
    return handleApiError(e)
  }
}
