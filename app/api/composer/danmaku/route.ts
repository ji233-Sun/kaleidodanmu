import { NextResponse } from 'next/server'
import { generateLiveDanmuFrame, generateVodElems } from '@/server/mock/danmaku'
import { handleApiError, requireUser } from '@/server/utils/http'

export const dynamic = 'force-dynamic'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/**
 * GET /api/composer/danmaku?mode=video|live
 * video 一次返回完整时间轴；live 通过实时 SSE 流返回与 WebSocket 相同的消息帧。
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req)
    const params = new URL(req.url).searchParams
    const mode = params.get('mode') ?? 'video'
    const seed = Number(params.get('seed') ?? user.id) || user.id

    if (mode === 'video') {
      const durationMs = clamp(Number(params.get('durationMs') ?? 60_000) || 60_000, 1_000, 3_600_000)
      const count = clamp(Number(params.get('count') ?? 320) || 320, 1, 2_000)
      return NextResponse.json({
        mode,
        durationMs,
        elems: generateVodElems(seed, count, durationMs),
      })
    }

    if (mode !== 'live') {
      return NextResponse.json(
        { error: { code: 'invalid_mode', message: 'mode must be video or live' } },
        { status: 400 },
      )
    }

    const rate = clamp(Number(params.get('rate') ?? 2) || 2, 0.2, 10)
    const encoder = new TextEncoder()
    let interval: ReturnType<typeof setInterval> | undefined
    let closed = false

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (frame: unknown) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`))
          } catch {
            closed = true
          }
        }

        send({ mode: 'live', op: 8, cmd: 'AUTH_REPLY', code: 0 })
        let sequence = 0
        interval = setInterval(() => {
          sequence += 1
          send({ mode: 'live', ...generateLiveDanmuFrame(seed, sequence) })
        }, Math.max(100, 1_000 / rate))
      },
      cancel() {
        closed = true
        if (interval) clearInterval(interval)
      },
    })

    req.signal.addEventListener('abort', () => {
      closed = true
      if (interval) clearInterval(interval)
    })

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
