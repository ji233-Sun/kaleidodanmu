import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { DraftService } from '@/server/services/draft.service'
import { SaveDraftSchema } from '@/types'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { id } = await params
    const draft = await DraftService.get(Number(id), user.id)
    return NextResponse.json({ draft })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { id } = await params
    const body = SaveDraftSchema.parse(await req.json())
    const draft = await DraftService.save(Number(id), user.id, body.snapshotJson)
    return NextResponse.json({ draft })
  } catch (e) {
    return handleApiError(e)
  }
}
