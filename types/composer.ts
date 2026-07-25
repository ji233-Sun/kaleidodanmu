import type { EffectDto } from './effect'
import type { LiveFrame, VodDanmakuElem } from './mock'

export type ComposerMode = 'video' | 'live'

export interface ComposerEffectsResponse {
  effects: EffectDto[]
}

export interface ComposerVideoDanmakuResponse {
  mode: 'video'
  durationMs: number
  elems: VodDanmakuElem[]
}

export interface ComposerLiveDanmakuFrame extends LiveFrame {
  mode: 'live'
}
