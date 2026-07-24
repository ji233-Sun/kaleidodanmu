import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { InteractionService } from '@/server/services/interaction.service'
import { z } from 'zod'

const KindSchema = z.enum(['like', 'favorite', 'coin'])

/** GET /api/users/me/reactions?kind=like|favorite|coin —— 我的点赞 / 收藏 / 投币作品。 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req)
    const kind = KindSchema.parse(new URL(req.url).searchParams.get('kind') ?? 'favorite')
    const items = await InteractionService.listMine(user.id, kind)
    return NextResponse.json({ items })
  } catch (e) {
    return handleApiError(e)
  }
}
