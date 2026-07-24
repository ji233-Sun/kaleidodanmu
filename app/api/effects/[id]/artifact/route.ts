import { NextResponse } from 'next/server'
import { getCurrentUser, handleApiError } from '@/server/utils/http'
import { VersionService } from '@/server/services/version.service'

type Ctx = { params: Promise<{ id: string }> }

const CHANNELS = ['draft', 'staging', 'published'] as const
type Channel = (typeof CHANNELS)[number]

/**
 * 按渠道读取某 Effect 的产物（入口 + 资源），供页面把已发布版本注入沙箱播放。
 * ?channel=published|staging|draft（默认 published）。匿名可读 public 的 published；owner 可读任意渠道。
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await getCurrentUser(req)
    const { id } = await params
    const raw = new URL(req.url).searchParams.get('channel')
    const channel: Channel = CHANNELS.includes(raw as Channel) ? (raw as Channel) : 'published'
    const artifact = await VersionService.getArtifactByChannel(Number(id), channel, user?.id ?? null)
    return NextResponse.json(artifact)
  } catch (e) {
    return handleApiError(e)
  }
}
