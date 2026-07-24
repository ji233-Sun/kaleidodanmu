import { NextResponse } from 'next/server'
import { handleApiError, requireUser } from '@/server/utils/http'
import { LlmConfigService } from '@/server/services/llmConfig.service'
import { buildPingRequest } from '@/server/services/llm/providers'
import { LLM_DEFAULT_BASE_URLS, TestLlmConfigSchema } from '@/types'

export const dynamic = 'force-dynamic'

const TEST_TIMEOUT_MS = 10_000

/** 从上游错误响应里提取可读原因。 */
async function upstreamErrorMessage(response: Response): Promise<string> {
  const fallback = response.statusText || 'request rejected'
  try {
    const payload = (await response.json()) as { error?: { message?: unknown } }
    const message = payload.error?.message
    return typeof message === 'string' && message.trim() ? message.slice(0, 500) : fallback
  } catch {
    return fallback
  }
}

/**
 * 用请求体参数向上游发一条最小请求验证连通性；apiKey 省略时用已保存的 key。
 * 失败也返回 200 + { ok: false, message }，便于设置页直接展示原因。
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req)
    const body = TestLlmConfigSchema.parse(await req.json())

    const saved = body.apiKey ? null : await LlmConfigService.resolveForUser(user.id)
    const apiKey = body.apiKey || saved?.apiKey
    if (!apiKey) return NextResponse.json({ ok: false, message: '尚未保存 API Key，请先输入' })

    const ping = buildPingRequest({
      provider: body.provider,
      baseUrl: body.baseUrl ?? saved?.baseUrl ?? LLM_DEFAULT_BASE_URLS[body.provider],
      apiKey,
      model: body.model,
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)
    let upstream: Response
    try {
      upstream = await fetch(ping.url, {
        method: 'POST',
        headers: ping.headers,
        body: JSON.stringify(ping.body),
        signal: controller.signal,
      })
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError' ? '连接超时（10s）' : '无法连接到上游服务'
      return NextResponse.json({ ok: false, message })
    } finally {
      clearTimeout(timeout)
    }
    if (!upstream.ok) {
      return NextResponse.json({ ok: false, message: `上游返回 HTTP ${upstream.status}: ${await upstreamErrorMessage(upstream)}` })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
