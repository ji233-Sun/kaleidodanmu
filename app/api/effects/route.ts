import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { EffectService } from '@/server/services/effect.service'
import { CreateEffectSchema } from '@/types'

export async function GET(req: Request) {
  try {
    const user = await requireUser(req)
    const effects = await EffectService.list(user.id)
    return NextResponse.json({ effects })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req)
    const body = CreateEffectSchema.parse(await req.json())
    const effect = await EffectService.create({ ownerId: user.id, ...body })
    return NextResponse.json({ effect }, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
