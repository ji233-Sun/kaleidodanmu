import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { LlmConfigService } from '@/server/services/llmConfig.service'
import { UpsertLlmConfigSchema } from '@/types'

export const dynamic = 'force-dynamic'

/** 读取当前用户的自带模型配置（key 只回末 4 位预览）。 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req)
    const config = await LlmConfigService.getDto(user.id)
    return NextResponse.json({ config })
  } catch (e) {
    return handleApiError(e)
  }
}

/** 新建或覆盖当前用户的自带模型配置（每用户单配置）。 */
export async function PUT(req: Request) {
  try {
    const user = await requireUser(req)
    const body = UpsertLlmConfigSchema.parse(await req.json())
    const config = await LlmConfigService.upsert(user.id, body)
    return NextResponse.json({ config })
  } catch (e) {
    return handleApiError(e)
  }
}

/** 删除自带模型配置，代理回退到平台内置（环境变量）。 */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req)
    await LlmConfigService.remove(user.id)
    return NextResponse.json({ config: null })
  } catch (e) {
    return handleApiError(e)
  }
}
