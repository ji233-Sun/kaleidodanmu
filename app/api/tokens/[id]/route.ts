import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { TokenService } from '@/server/services/token.service'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { id } = await params
    await TokenService.revoke(Number(id), user.id)
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e)
  }
}
