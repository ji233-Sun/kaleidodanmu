import { NextResponse } from 'next/server'
import { handleApiError } from '@/server/utils/http'
import { FollowService } from '@/server/services/follow.service'

type Ctx = { params: Promise<{ name: string }> }

/** GET /api/users/:name/followers —— 某用户的粉丝（公开）。 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { name } = await params
    const items = await FollowService.listFollowersByName(decodeURIComponent(name))
    return NextResponse.json({ items })
  } catch (e) {
    return handleApiError(e)
  }
}
