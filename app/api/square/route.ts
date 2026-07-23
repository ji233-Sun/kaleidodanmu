import { NextResponse } from 'next/server'
import { handleApiError } from '@/server/utils/http'
import { SquareService } from '@/server/services/square.service'

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams
    const limit = Number(sp.get('limit') ?? 20)
    const offset = Number(sp.get('offset') ?? 0)
    const result = await SquareService.list(
      Number.isFinite(limit) ? limit : 20,
      Number.isFinite(offset) ? offset : 0,
    )
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
