import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { EffectService } from '@/server/services/effect.service'
import { PublishEffectSchema } from '@/types'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { id } = await params
    const body = PublishEffectSchema.parse(await req.json())
    const effect = await EffectService.publish(Number(id), user.id, body.versionId, body.channel)
    return NextResponse.json({ effect })
  } catch (e) {
    return handleApiError(e)
  }
}
