import { NextResponse } from 'next/server'
import { handleApiError } from '@/server/utils/http'
import { generateVodElems } from '@/server/mock/danmaku'

/** GET /api/mock/vod —— 点播弹幕 Mock（DmSegMobileReply 风格 { elems: [...] }）。 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams
    const seed = Number(sp.get('seed') ?? 42) || 42
    const count = Math.min(Math.max(1, Number(sp.get('count') ?? 200)), 1000)
    const duration = Number(sp.get('duration') ?? 60_000) || 60_000
    const elems = generateVodElems(seed, count, duration)
    return NextResponse.json({ elems })
  } catch (e) {
    return handleApiError(e)
  }
}
