import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { EffectService } from '@/server/services/effect.service'
import { UpdateEffectSchema } from '@/types'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { id } = await params
    const effect = await EffectService.get(Number(id), user.id)
    return NextResponse.json({ effect })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { id } = await params
    const body = UpdateEffectSchema.parse(await req.json())
    const effect = await EffectService.update(Number(id), user.id, body)
    return NextResponse.json({ effect })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { id } = await params
    await EffectService.remove(Number(id), user.id)
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e)
  }
}
