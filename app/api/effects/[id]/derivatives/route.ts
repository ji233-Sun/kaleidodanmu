import { NextResponse } from 'next/server'
import { handleApiError } from '@/server/utils/http'
import { InteractionService } from '@/server/services/interaction.service'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const limit = Number(new URL(req.url).searchParams.get('limit') ?? 20)
    const items = await InteractionService.listDerivatives(
      Number(id),
      Number.isFinite(limit) ? limit : 20,
    )
    return NextResponse.json({ items })
  } catch (e) {
    return handleApiError(e)
  }
}
