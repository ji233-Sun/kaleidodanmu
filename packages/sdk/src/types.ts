import type * as Three from 'three'
import type { gsap as gsapInstance } from 'gsap'

/** 归一化弹幕事件（与技术方案 §4 对齐）。 */
export interface DanmakuEvent {
  id: string
  source: 'vod' | 'live'
  text: string
  videoTimeMs?: number
  receivedAt: number
  mode: 'scroll' | 'top' | 'bottom'
  color: number
  fontSize: number
  weight: number
  seed: number
}

/** 兼容配方：为旧作品保留的声明式基础参数，不限制 Canvas 的实际表现。 */
export interface Recipe {
  /** 对称切片数 3-12 */
  symmetry: number
  /** 旋转速度（圈/秒，可正可负） */
  rotationSpeed: number
  /** 碎片运动模式 */
  motion: 'spiral' | 'burst' | 'orbit' | 'flow'
  /** 色彩策略 */
  palette: string[]
  /** 碎片缩放 */
  shardScale: number
  /** 拖影强度 0-0.9 */
  trail: number
  /** 弹幕密度倍率 0.3-2 */
  density: number
}

export interface EffectViewport {
  width: number
  height: number
  dpr: number
}

export interface EffectFrame {
  now: number
  delta: number
}

export interface EffectPointerEvent {
  type: 'down' | 'move' | 'up' | 'cancel'
  /** Canvas CSS 像素坐标。 */
  x: number
  y: number
  /** 归一化坐标，左上为 (0, 0)，右下为 (1, 1)。 */
  nx: number
  ny: number
  pressure: number
  pointerId: number
  pointerType: string
}

export interface EffectSetupContext {
  canvas: HTMLCanvasElement
  recipe: Recipe
  THREE: typeof Three
  gsap: typeof gsapInstance
}

export interface EffectInstance {
  onDanmaku?(event: DanmakuEvent): void
  onPointer?(event: EffectPointerEvent): void
  render(frame: EffectFrame): void
  resize(viewport: EffectViewport): void
  setPlaying?(playing: boolean): void
  reset?(): void
  dispose(): void
}

export interface EffectDefinition {
  setup(context: EffectSetupContext): EffectInstance
}

/** 宿主 → 运行时 的控制命令。source 为入口模块文本（ADE 原始源或 CLI 打包产物均可）。 */
export type RuntimeCommand =
  | { type: 'load'; source: string; recipe: Recipe; playing: boolean; assets?: RuntimeAsset[] }
  | { type: 'danmaku'; event: DanmakuEvent }
  | { type: 'playing'; playing: boolean }
  | { type: 'reset' }

/** 运行时 → 宿主 的回流事件。 */
export type RuntimeEvent =
  | { type: 'ready' }
  | { type: 'fps'; value: number }
  | { type: 'error'; message: string }

/** 随 load 命令注入的静态资源（base64），运行时转 blob URL 后供 assetUrl 解析。 */
export interface RuntimeAsset {
  path: string
  mime: string
  /** base64 编码的资源字节。 */
  data: string
}
