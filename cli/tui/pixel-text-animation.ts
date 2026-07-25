// 像素风立体字动画引擎：
// "KALEIDODANMU" 用 5×7 像素字体 + z 轴三层挤出（前亮后暗）构成 voxel 立体字。
// 一群随机散布的三维粒子先聚合为立体字，随后一道高光从左向右扫过字面，
// 停留片刻后粒子散开，循环播放。3D 旋转用 three.js（Euler/Vector3），弱透视投影。
// 渲染用半块字符（▀/▄）把纵向两个像素打包进一格，得到正方形像素；
// 逐帧光栅化为终端字符单元（ch + fg/bg），由调用方写入终端 buffer。

import { Euler, Vector3 } from 'three'

export interface FrameOp {
  x: number
  y: number
  ch: string
  fg: string
  bg?: string
}

// ---------- 5×7 像素字体（仅覆盖 KaleidoDanmu 用到的字母） ----------

const GLYPHS: Record<string, string[]> = {
  K: ['█...█', '█..█.', '█.█..', '██...', '█.█..', '█..█.', '█...█'],
  A: ['.███.', '█...█', '█...█', '█████', '█...█', '█...█', '█...█'],
  L: ['█....', '█....', '█....', '█....', '█....', '█....', '█████'],
  E: ['█████', '█....', '█....', '████.', '█....', '█....', '█████'],
  I: ['█████', '..█..', '..█..', '..█..', '..█..', '..█..', '█████'],
  D: ['████.', '█...█', '█...█', '█...█', '█...█', '█...█', '████.'],
  O: ['.███.', '█...█', '█...█', '█...█', '█...█', '█...█', '.███.'],
  N: ['█...█', '██..█', '██..█', '█.█.█', '█..██', '█..██', '█...█'],
  M: ['█...█', '██.██', '█.█.█', '█.█.█', '█...█', '█...█', '█...█'],
  U: ['█...█', '█...█', '█...█', '█...█', '█...█', '█...█', '.███.'],
}

const TEXT = 'KALEIDODANMU'
const GLYPH_W = 5
const GLYPH_H = 7
const SPACING = 1
/** 挤出深度（世界单位，飞行阶段的 z 间距）与层数：前面 + 正下方投影 */
const DEPTH = 1.2
const LAYERS = 2

// ---------- 渐变（favicon 同款：青 → 蓝紫 → 品红） ----------

const STOPS: Array<[number, [number, number, number]]> = [
  [0, [0x15, 0xa9, 0xef]],
  [0.3, [0x66, 0x65, 0xc9]],
  [0.5, [0x8b, 0x48, 0xb9]],
  [0.7, [0xa1, 0x3c, 0xb3]],
  [0.9, [0xe1, 0x1c, 0xa3]],
  [1, [0xf9, 0x10, 0x9d]],
]

function hex(rgb: [number, number, number], k = 1): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`
}

/** 按文字列位置 t∈[0,1] 取渐变色的 LUT（含各层亮度：前层全亮，往后逐层变暗） */
const LUT: string[][] = []
for (let i = 0; i < 128; i++) {
  const t = i / 127
  let s = 0
  while (s < STOPS.length - 2 && t > STOPS[s + 1][0]) s++
  const [t0, c0] = STOPS[s]
  const [t1, c1] = STOPS[s + 1]
  const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0)
  const rgb: [number, number, number] = [
    c0[0] + (c1[0] - c0[0]) * k,
    c0[1] + (c1[1] - c0[1]) * k,
    c0[2] + (c1[2] - c0[2]) * k,
  ]
  // 前面全亮，投影压暗
  LUT.push([hex(rgb), hex(rgb, 0.3)])
}
const lutOf = (t: number) => LUT[Math.max(0, Math.min(127, Math.round(t * 127)))]

/** 扫光时提亮 */
function brighten(fgHex: string): string {
  const n = parseInt(fgHex.slice(1), 16)
  return hex([
    Math.min(255, ((n >> 16) & 255) + 110),
    Math.min(255, ((n >> 8) & 255) + 110),
    Math.min(255, (n & 255) + 110),
  ])
}

// ---------- 体素目标 ----------

interface Voxel {
  /** 像素列位置比例 0..1（用于渐变） */
  t: number
  target: Vector3
  layer: number
}

function buildVoxels(): Voxel[] {
  const totalCols = TEXT.length * (GLYPH_W + SPACING) - SPACING
  const voxels: Voxel[] = []
  for (let ci = 0; ci < TEXT.length; ci++) {
    const glyph = GLYPHS[TEXT[ci]]
    if (!glyph) continue
    for (let row = 0; row < GLYPH_H; row++) {
      for (let col = 0; col < GLYPH_W; col++) {
        if (glyph[row][col] !== '█') continue
        const gx = ci * (GLYPH_W + SPACING) + col
        for (let layer = 0; layer < LAYERS; layer++) {
          voxels.push({
            t: gx / (totalCols - 1),
            target: new Vector3(
              gx - (totalCols - 1) / 2,
              GLYPH_H / 2 - row,
              -layer * (DEPTH / (LAYERS - 1)),
            ),
            layer,
          })
        }
      }
    }
  }
  return voxels
}

// ---------- 动画 ----------

// 时间轴（毫秒）
const DUR_GATHER = 2400 // 聚合
const DUR_SWEEP = 1800 // 扫光
const DUR_HOLD = 1000 // 停留
const DUR_DISPERSE = 1200 // 散开
const LOOP = DUR_GATHER + DUR_SWEEP + DUR_HOLD + DUR_DISPERSE

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInCubic = (t: number) => t * t * t
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))

interface Particle {
  start: Vector3
  voxel: Voxel
  delay: number
}

export class PixelTextAnimation {
  private particles: Particle[] = []
  /** 文字半宽（世界单位），用于扫光定位与缩放计算 */
  private halfW: number

  constructor() {
    const voxels = buildVoxels()
    this.halfW = (TEXT.length * (GLYPH_W + SPACING) - SPACING - 1) / 2
    for (const voxel of voxels) {
      // 初始位置：半径 26~42 的球壳（相对文字尺度够远）
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 26 + Math.random() * 16
      this.particles.push({
        start: new Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta) * 0.5,
          r * Math.cos(phi),
        ),
        voxel,
        delay: Math.random() * 0.4,
      })
    }
  }

  /** 计算 t 时刻的一帧（写入区域 w×h 内的字符操作，坐标相对区域左上角）。 */
  frame(timeMs: number, w: number, h: number): FrameOp[] {
    const t = timeMs % LOOP
    const elapsed = timeMs / 1000
    const euler = new Euler(
      Math.sin(elapsed * 0.31) * 0.12,
      Math.sin(elapsed * 0.43) * 0.3,
      0,
    )
    const PERSPECTIVE = 90 // 弱透视：z 越深略微缩小

    // 像素缩放 s（格/像素）：s=1 → 71×7 格；s=2 → 142×14 格（少见，能放就放）
    const s = (this.halfW * 2 + 6) * 2 <= w - 2 && 16 <= h ? 2 : 1
    const cx = (w - 1) / 2
    const cy = (h - 1) / 2
    const v = new Vector3()
    // 飞行投影：3D 旋转 + 弱透视（连续坐标，格单位）
    const flight = (p: Vector3): [number, number] => {
      v.copy(p).applyEuler(euler)
      const k = (PERSPECTIVE / (PERSPECTIVE - v.z)) * s
      return [cx + v.x * k, cy - v.y * k]
    }
    // 成型投影：像素级网格 + 投影层垂直下移一格（只露出字形下沿，不糊镂空）
    const grid = (p: Vector3, layer: number): [number, number] => [
      Math.round(cx + p.x * s),
      Math.round(cy - (p.y - layer) * s),
    ]

    // 扫光位置（仅扫光阶段移动）
    const sweeping = t >= DUR_GATHER && t < DUR_GATHER + DUR_SWEEP
    const sweepX = sweeping
      ? -this.halfW - 4 + ((t - DUR_GATHER) / DUR_SWEEP) * (this.halfW * 2 + 8)
      : null
    const dispersing = t >= DUR_GATHER + DUR_SWEEP + DUR_HOLD

    const LAYER_CH = ['█', '▒']
    const ops = new Map<number, FrameOp>()
    const put = (x: number, y: number, ch: string, fg: string) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return
      ops.set(y * w + x, { x, y, ch, fg })
    }

    // 后层先画、前层覆盖
    const sorted = [...this.particles].sort((a, b) => b.voxel.layer - a.voxel.layer)
    for (const p of sorted) {
      const { target, layer, t: ct } = p.voxel
      let pos: Vector3
      let sf: number // 成型度 0..1：0=飞行投影，1=像素网格投影
      if (dispersing) {
        const pd = easeInCubic((t - DUR_GATHER - DUR_SWEEP - DUR_HOLD) / DUR_DISPERSE)
        pos = v.set(
          target.x + (p.start.x - target.x) * pd,
          target.y + (p.start.y - target.y) * pd,
          target.z + (p.start.z - target.z) * pd,
        )
        sf = 1 - pd
      } else {
        sf = easeOutCubic(clamp01((t / DUR_GATHER - p.delay) / (1 - p.delay)))
        pos = v.set(
          p.start.x + (target.x - p.start.x) * sf,
          p.start.y + (target.y - p.start.y) * sf,
          p.start.z + (target.z - p.start.z) * sf,
        )
      }
      // 两种投影按成型度混合：飞行时是 3D 点云，落定后咬合为像素网格
      const [fx, fy] = flight(pos)
      const [gx, gy] = grid(target, layer)
      const px = Math.round(fx + (gx - fx) * sf)
      const py = Math.round(fy + (gy - fy) * sf)

      let fg = lutOf(ct)[layer]
      if (sweepX !== null && layer === 0 && Math.abs(target.x - sweepX) < 3) fg = brighten(fg)
      const ch = dispersing ? '·' : sf < 0.85 ? '•' : LAYER_CH[layer]
      if (s === 2 && sf >= 0.85) {
        // 2 倍档：每像素 2×2 格
        put(px, py, ch, fg)
        put(px + 1, py, ch, fg)
        put(px, py + 1, ch, fg)
        put(px + 1, py + 1, ch, fg)
      } else {
        put(px, py, ch, fg)
      }
    }
    return [...ops.values()]
  }
}
