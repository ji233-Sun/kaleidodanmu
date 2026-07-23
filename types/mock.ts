/** B站 DmSegMobileReply 风格的单条弹幕元素（点播）。 */
export interface VodDanmakuElem {
  id: number
  /** 出现时间（毫秒） */
  progress: number
  /** 1=滚动 4=底部 5=顶部 */
  mode: number
  fontsize: number
  /** 十进制 RGB */
  color: number
  midHash: string
  content: string
  ctime: number
  weight: number
  pool: number
  idStr: string
}

/** 点播弹幕分段回复。 */
export interface VodDanmakuReply {
  elems: VodDanmakuElem[]
}

/** 直播推送帧（SSE / WebSocket 通用）。op: 5=消息 8=鉴权回执。 */
export interface LiveFrame {
  op: number
  cmd?: string
  [key: string]: unknown
}
