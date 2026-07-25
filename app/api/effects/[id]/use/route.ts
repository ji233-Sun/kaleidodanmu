import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { EffectService } from '@/server/services/effect.service'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { id } = await params
    const effect = await EffectService.createUsedCopy(Number(id), user.id)
    return NextResponse.json({ effect })
  } catch (e) {
    return handleApiError(e)
  }
}
