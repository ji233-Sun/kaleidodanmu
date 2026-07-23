/** 简单的进程内固定窗口限流（原型够用；生产换 Redis 之类）。 */
interface Bucket {
  count: number
  windowStart: number
}

const buckets = new Map<string, Bucket>()
const WINDOW_MS = 60_000

/** 返回 true 表示放行，false 表示已超限。 */
export function rateLimit(key: string, max: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now - b.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now })
    return true
  }
  if (b.count >= max) return false
  b.count += 1
  return true
}
