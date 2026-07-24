import { NextResponse } from 'next/server'
import { getCurrentUser, handleApiError } from '@/server/utils/http'
import { VersionService } from '@/server/services/version.service'

type Ctx = { params: Promise<{ id: string; versionId: string }> }

/** 读取某版本的完整产物（入口模块 + 静态资源），供运行时加载。可匿名访问已发布的公开版本。 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await getCurrentUser(req)
    const { id, versionId } = await params
    const artifact = await VersionService.getArtifact(Number(id), Number(versionId), user?.id ?? null)
    return NextResponse.json(artifact)
  } catch (e) {
    return handleApiError(e)
  }
}
