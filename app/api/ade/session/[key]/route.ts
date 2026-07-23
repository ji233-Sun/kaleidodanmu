import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { AdeSessionService } from '@/server/services/adeSession.service'
import { SaveAdeSessionSchema } from '@/types'
import { HttpError } from '@/server/utils/errors'

type Ctx = { params: Promise<{ key: string }> }

export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { key: raw } = await params
    const targetKey = raw.trim()
    if (!targetKey || targetKey.length > 256) throw new HttpError(400, 'invalid_target_key', 'targetKey 无效')
    const session = await AdeSessionService.get(user.id, targetKey)
    return NextResponse.json({ session })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { key: raw } = await params
    const targetKey = raw.trim()
    if (!targetKey || targetKey.length > 256) throw new HttpError(400, 'invalid_target_key', 'targetKey 无效')
    const body = SaveAdeSessionSchema.parse(await req.json())
    const session = await AdeSessionService.save(user.id, targetKey, body.payload)
    return NextResponse.json({ session })
  } catch (e) {
    return handleApiError(e)
  }
}
