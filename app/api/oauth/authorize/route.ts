import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { OAuthService } from '@/server/services/oauth.service'
import { AuthorizeRequestSchema, type AuthorizeResponse } from '@/types'

export async function POST(req: Request) {
  try {
    const user = await requireUser(req)
    const body = AuthorizeRequestSchema.parse(await req.json())
    const code = await OAuthService.issueCode(user.id, body)
    // 跳转由前端在浏览器侧执行（redirect_uri 指向 CLI 的本地回调端口）
    return NextResponse.json({ code } satisfies AuthorizeResponse, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
