import { NextResponse } from 'next/server'
import { handleApiError } from '@/server/utils/http'
import { FollowService } from '@/server/services/follow.service'

type Ctx = { params: Promise<{ name: string }> }

/** GET /api/users/:name/following —— 某用户关注的人（公开）。 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { name } = await params
    const items = await FollowService.listFollowingByName(decodeURIComponent(name))
    return NextResponse.json({ items })
  } catch (e) {
    return handleApiError(e)
  }
}
