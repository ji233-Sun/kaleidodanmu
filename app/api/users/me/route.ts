import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { UserService } from '@/server/services/user.service'
import { UpdateProfileSchema } from '@/types'

export async function PATCH(req: Request) {
  try {
    const user = await requireUser(req)
    const body = UpdateProfileSchema.parse(await req.json())
    const updated = await UserService.updateProfile(user.id, body)
    return NextResponse.json({ user: updated })
  } catch (e) {
    return handleApiError(e)
  }
}
