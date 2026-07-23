import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { InteractionService } from '@/server/services/interaction.service'
import { InteractionSchema } from '@/types'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { id } = await params
    const body = InteractionSchema.parse(await req.json())
    const result = await InteractionService.toggle(user.id, Number(id), body.kind, body.on)
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
