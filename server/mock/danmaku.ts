import type { VodDanmakuElem, LiveFrame } from '@/types'

/** 确定性字符串哈希（FNV-1a 32）。 */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 种子化 PRNG（mulberry32）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TEXTS = [
  '2333', '哈哈哈', '前排', 'awsl', '泪目', '666', '草', '好强', '梦幻',
  '万花筒好好看', '泪奔', '这弹幕绝了', '玻璃碎了', '太美了', '原地飞升', '存了',
  '？？？', '名场面', '建议申遗', '前方高能',
]
const COLORS = [16777215, 16769057, 16738674, 11339754, 6765239, 4129023]
const MODES = [1, 1, 1, 1, 1, 4, 5] // 多数滚动，少量顶/底

/** 生成点播弹幕元素（DmSegMobileReply 风格），按 progress 升序。 */
export function generateVodElems(seed: number, count: number, durationMs: number): VodDanmakuElem[] {
  const rand = mulberry32(seed || 1)
  const base = 1_700_000_000
  const elems: VodDanmakuElem[] = []
  for (let i = 0; i < count; i++) {
    const id = (seed || 1) * 100_000 + i
    elems.push({
      id,
      idStr: String(id),
      progress: Math.floor(rand() * (durationMs || 60_000)),
      mode: MODES[Math.floor(rand() * MODES.length)],
      fontsize: 25,
      color: COLORS[Math.floor(rand() * COLORS.length)],
      midHash: hashString(`mid:${id}`).toString(16).padStart(8, '0').slice(0, 8),
      content: TEXTS[Math.floor(rand() * TEXTS.length)],
      ctime: base + Math.floor(rand() * 10_000_000),
      weight: Math.floor(rand() * 10),
      pool: 0,
    })
  }
  return elems.sort((a, b) => a.progress - b.progress)
}

/** 生成一条直播弹幕帧（DANMU_MSG，info 为简化的 B站 风格数组）。 */
export function generateLiveDanmuFrame(seed: number, seq: number): LiveFrame {
  const rand = mulberry32(hashString(`live:${seed}:${seq}`))
  const text = TEXTS[Math.floor(rand() * TEXTS.length)]
  const color = COLORS[Math.floor(rand() * COLORS.length)]
  return {
    op: 5,
    cmd: 'DANMU_MSG',
    info: [
      [0, 1, 25, color, text, 0, 0, 0, 0, seq],
      text,
      [hashString(`u:${seed}:${seq}`)],
    ],
  }
}
