import { NextResponse } from 'next/server'
import { handleApiError, requireUser, apiError } from '@/server/utils/http'
import { env } from '@/lib/env'
import { rateLimit } from '@/server/utils/rateLimit'

export const dynamic = 'force-dynamic'

const RATE_LIMIT_PER_MIN = 20

/**
 * POST /api/llm/proxy —— LLM 代理转发（OpenAI 兼容）。
 * 只做转发 + 限流，不执行任何代码。需登录；未配置 LLM_API_KEY 返回 503。
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req)
    if (!rateLimit(`llm:${user.id}`, RATE_LIMIT_PER_MIN)) {
      return apiError(429, 'rate_limited', 'LLM proxy rate limit exceeded')
    }
    if (!env.llmApiKey) {
      return apiError(503, 'llm_not_configured', 'LLM proxy is not configured (set LLM_API_KEY)')
    }

    const body = await req.json()
    if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) {
      return apiError(400, 'invalid_request', 'Expected { model, messages, ... }')
    }
    const wantStream = body.stream === true

    const upstream = await fetch(`${env.llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.llmApiKey}`,
      },
      body: JSON.stringify(body),
      signal: req.signal,
    })

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => upstream.statusText)
      return apiError(upstream.status, 'llm_upstream_error', text || upstream.statusText)
    }

    if (wantStream && upstream.body) {
      return new Response(upstream.body, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
        },
      })
    }
    return NextResponse.json(await upstream.json())
  } catch (e) {
    return handleApiError(e)
  }
}
