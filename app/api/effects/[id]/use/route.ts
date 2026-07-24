import { NextResponse } from 'next/server'
import { handleApiError } from '@/server/utils/http'
import { InteractionService } from '@/server/services/interaction.service'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const count = await InteractionService.recordUse(Number(id))
    return NextResponse.json({ count })
  } catch (e) {
    return handleApiError(e)
  }
}
