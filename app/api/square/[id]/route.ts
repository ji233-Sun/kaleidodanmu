import { NextResponse } from 'next/server'
import { handleApiError, getCurrentUser, HttpError } from '@/server/utils/http'
import { SquareService } from '@/server/services/square.service'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const viewer = await getCurrentUser(req)
    const detail = await SquareService.detail(Number(id), viewer?.id ?? null)
    if (!detail) throw new HttpError(404, 'not_found', 'Effect not found')
    return NextResponse.json(detail)
  } catch (e) {
    return handleApiError(e)
  }
}
