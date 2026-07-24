import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { FollowService } from '@/server/services/follow.service'

/** GET /api/users/me/following —— 我关注的用户。 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req)
    const items = await FollowService.listFollowing(user.id)
    return NextResponse.json({ items })
  } catch (e) {
    return handleApiError(e)
  }
}
