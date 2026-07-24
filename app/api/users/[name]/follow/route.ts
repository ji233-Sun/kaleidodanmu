import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { FollowService } from '@/server/services/follow.service'
import { FollowSchema } from '@/types'

type Ctx = { params: Promise<{ name: string }> }

/** POST /api/users/:name/follow { on } —— 关注 / 取关。 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { name } = await params
    const body = FollowSchema.parse(await req.json())
    const result = await FollowService.toggle(user.id, decodeURIComponent(name), body.on)
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
