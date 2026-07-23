import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { VersionService } from '@/server/services/version.service'
import { CreateVersionSchema } from '@/types'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { id } = await params
    const versions = await VersionService.list(Number(id), user.id)
    return NextResponse.json({ versions })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req)
    const { id } = await params
    const body = CreateVersionSchema.parse(await req.json())
    const version = await VersionService.create(Number(id), user.id, body)
    return NextResponse.json({ version }, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
