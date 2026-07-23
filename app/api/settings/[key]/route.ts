import { NextResponse } from 'next/server'
import { handleApiError, requireUser, HttpError } from '@/server/utils/http'
import { SettingsService } from '@/server/services/settings.service'
import { UpdateSettingSchema } from '@/types'

type Ctx = { params: Promise<{ key: string }> }

export async function GET(req: Request, { params }: Ctx) {
  try {
    await requireUser(req)
    const { key } = await params
    const setting = await SettingsService.get(key)
    if (!setting) throw new HttpError(404, 'not_found', 'Setting not found')
    return NextResponse.json({ setting })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    await requireUser(req)
    const { key } = await params
    const body = UpdateSettingSchema.parse(await req.json())
    const setting = await SettingsService.set(key, body.value)
    return NextResponse.json({ setting })
  } catch (e) {
    return handleApiError(e)
  }
}
