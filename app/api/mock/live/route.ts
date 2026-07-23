import { handleApiError } from '@/server/utils/http'
import { generateLiveDanmuFrame } from '@/server/mock/danmaku'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mock/live —— 直播弹幕 Mock。
 * 以 SSE 推送：先发鉴权回执（op:8 AUTH_REPLY）与 CONNECTED，再按 rate 持续推
 * DANMU_MSG 帧（op:5），模拟 B站直播弹幕流。原型用 SSE 替代独立 WS 进程；
 * 生产化时按技术方案改为独立 Node WS 进程，本路由只做握手与鉴权。
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams
    const seed = Number(sp.get('seed') ?? 42) || 42
    const rate = Math.min(Math.max(0.2, Number(sp.get('rate') ?? 2)), 10) // 帧/秒

    const encoder = new TextEncoder()
    let interval: ReturnType<typeof setInterval> | undefined
    let closed = false

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (obj: unknown) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
          } catch {
            closed = true
          }
        }
        send({ op: 8, cmd: 'AUTH_REPLY', code: 0 })
        send({ op: 5, cmd: 'CONNECTED', seed })
        let seq = 0
        interval = setInterval(() => {
          seq += 1
          send(generateLiveDanmuFrame(seed, seq))
        }, Math.max(100, 1000 / rate))
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
  } catch (e) {
    return handleApiError(e)
  }
}
