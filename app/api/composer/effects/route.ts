import { NextResponse } from 'next/server'
import { EffectService } from '@/server/services/effect.service'
import { handleApiError, requireUser } from '@/server/utils/http'

/** GET /api/composer/effects - 返回当前用户可用于视频编排的全部万花筒。 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req)
    return NextResponse.json({ effects: await EffectService.list(user.id) })
  } catch (error) {
    return handleApiError(error)
  }
}
