import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { SettingsService } from '@/server/services/settings.service'

export async function GET(req: Request) {
  try {
    await requireUser(req)
    const settings = await SettingsService.list()
    return NextResponse.json({ settings })
  } catch (e) {
    return handleApiError(e)
  }
}
