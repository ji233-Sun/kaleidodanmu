// 我的弹幕社区状态 TUI：
// vue-tui 渲染资料 / 社区总览 / 作品列表；顶部「弹幕条」由 DanmakuStrip 逐帧直写终端
// buffer，用作品名 + 经典弹幕词从右往左飞过，模拟 B 站滚动弹幕。
// 布局与驱动方式对齐 home-app / interactive 的点云动画模式（vue-tui 画面板，buffer 直写动画区）。

import { computed, defineComponent, h, type PropType } from 'vue'
import { TBox, TText } from '@simon_he/vue-tui'
import type { MyProfile } from '../api'

export interface FrameOp {
  x: number
  y: number
  ch: string
  fg: string
}

// 仿 B 站主题的弹幕配色
const DM_COLORS = ['#fb7299', '#00a1d6', '#8b7cf6', '#ffd166', '#7ee0a3', '#fc8bab']
// 没有作品时也能撑起弹幕条的经典词
const DM_WORDS = [
  '前方高能', '2333', 'AWSL', '一键三连', '名场面', '弹幕护体',
  '再来亿遍', '泪目', '绝绝子', '爷青回', '全体起立', '上头了',
]

// ---------- 终端字符宽度（CJK 占 2 列） ----------

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3040 && code <= 0x33bf) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  )
}
function charWidth(ch: string): number {
  return isWide(ch.codePointAt(0) ?? 0) ? 2 : 1
}
function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) w += charWidth(ch)
  return w
}
/** 按显示宽度截断，超出补省略号。 */
function truncateWidth(s: string, max: number): string {
  if (max <= 1) return ''
  let w = 0
  let out = ''
  for (const ch of s) {
    const cw = charWidth(ch)
    if (w + cw > max - 1) return out + '…'
    out += ch
    w += cw
  }
  return out
}

function fmtNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// ---------- 弹幕 mock：终端滚动文字 ----------

/**
 * 终端滚动弹幕条。用作品名 + 经典弹幕词，随机颜色 / 轨道 / 速度，从右往左飞过。
 * frame() 每帧推进并返回需要写入 buffer 的字符单元（调用方负责 fill + put）。
 */
export class DanmakuStrip {
  private items: { text: string; color: string; x: number; y: number; speed: number }[] = []
  private cooldown = 0
  private rngState: number
  private readonly pool: string[]

  constructor(texts: string[], seed = 1) {
    const pool = [...new Set([...texts.filter(Boolean), ...DM_WORDS])]
    this.pool = pool.length > 0 ? pool : DM_WORDS
    this.rngState = (seed >>> 0) || 1
  }

  // xorshift32：确定性伪随机，避免依赖 Math.random，便于复现
  private rand(): number {
    this.rngState ^= this.rngState << 13
    this.rngState ^= this.rngState >>> 17
    this.rngState ^= this.rngState << 5
    this.rngState = this.rngState >>> 0
    return (this.rngState % 100000) / 100000
  }

  frame(cols: number, h: number): FrameOp[] {
    if (h <= 0) return []
    // 推进
    for (const it of this.items) it.x -= it.speed
    // 回收完全离屏的
    this.items = this.items.filter((it) => it.x + displayWidth(it.text) >= 0)
    // 生成新弹幕（密度随轨道数限制）
    this.cooldown -= 1
    if (this.cooldown <= 0 && this.items.length < Math.max(2, h * 2)) {
      const text = this.pool[Math.floor(this.rand() * this.pool.length)]
      this.items.push({
        text,
        color: DM_COLORS[Math.floor(this.rand() * DM_COLORS.length)],
        x: cols + this.rand() * 8,
        y: Math.floor(this.rand() * h),
        speed: 0.4 + this.rand() * 0.7,
      })
      this.cooldown = 2 + Math.floor(this.rand() * 5)
    }
    // 渲染：逐字符按显示宽度放置
    const ops: FrameOp[] = []
    for (const it of this.items) {
      if (it.y < 0 || it.y >= h) continue
      let x = Math.round(it.x)
      for (const ch of it.text) {
        if (x >= -1 && x < cols) ops.push({ x, y: it.y, ch, fg: it.color })
        x += charWidth(ch)
      }
    }
    return ops
  }
}

// ---------- 布局 ----------

export interface CommunityLayout {
  /** 弹幕条内容区（不含边框），null 表示终端太小不显示弹幕动画 */
  strip: { x: number; y: number; w: number; h: number } | null
  /** 数据面板起始行 */
  panelY: number
}

export function computeCommunityLayout(cols: number, rows: number): CommunityLayout {
  // 顶部弹幕条（内容 3 行 + 边框 2 行 = 5 行），下方为数据面板
  const showStrip = rows >= 14 && cols >= 40
  if (!showStrip) return { strip: null, panelY: 2 }
  const stripH = Math.min(3, Math.max(1, rows - 12))
  const stripW = Math.min(cols - 4, 80)
  const stripX = Math.max(2, Math.floor((cols - stripW) / 2))
  return { strip: { x: stripX, y: 2, w: stripW, h: stripH }, panelY: 2 + stripH + 3 }
}

// ---------- 数据面板 ----------

export const CommunityApp = defineComponent({
  name: 'KdanmuCommunity',
  props: {
    cols: { type: Number, required: true },
    rows: { type: Number, required: true },
    profile: { type: Object as PropType<MyProfile>, required: true },
  },
  setup(props) {
    const layout = computed(() => computeCommunityLayout(props.cols, props.rows))
    const stats = computed(() => [
      { label: '粉丝', value: props.profile.followers },
      { label: '关注', value: props.profile.following },
      { label: '获赞', value: props.profile.totalLikes },
      { label: '获币', value: props.profile.totalCoins },
      { label: '被收藏', value: props.profile.totalFavorites },
      { label: '二创', value: props.profile.totalRemixes },
    ])

    return () => {
      const l = layout.value
      const maxX = props.cols - 2
      const children: ReturnType<typeof h>[] = []

      // 弹幕条边框（内容区由外部 DanmakuStrip 直写）
      if (l.strip) {
        children.push(
          h(TBox, {
            x: l.strip.x - 1,
            y: l.strip.y - 1,
            w: l.strip.w + 2,
            h: l.strip.h + 2,
            border: true,
            style: { fg: '#30345e' },
          }),
        )
      }

      const x = 2
      let y = l.panelY

      children.push(h(TText, { x, y, value: '◆ 我的弹幕社区状态', style: { fg: '#fb7299', bold: true } }))
      y += 2

      // 资料
      children.push(
        h(TText, {
          x,
          y,
          value: truncateWidth(props.profile.displayName, maxX - x),
          style: { fg: 'whiteBright', bold: true },
        }),
      )
      y += 1
      if (props.profile.bio) {
        children.push(h(TText, { x, y, value: truncateWidth(props.profile.bio, maxX - x), style: { dim: true } }))
        y += 1
      }
      children.push(h(TText, { x, y, value: `加入于 ${fmtDate(props.profile.joinedAt)}`, style: { fg: 'gray' } }))
      y += 2

      // 社区总览
      const statLine = stats.value.map((s) => `${s.label} ${fmtNum(s.value)}`).join('   ')
      children.push(h(TText, { x, y, value: truncateWidth(statLine, maxX - x), style: { fg: 'whiteBright' } }))
      y += 2

      // 作品列表（每个作品 = 名称 + 对应的赞/币/收藏/二创）
      children.push(
        h(TText, { x, y, value: `弹幕作品 (${props.profile.effects.length})`, style: { fg: '#00a1d6', bold: true } }),
      )
      y += 1

      if (props.profile.effects.length === 0) {
        children.push(
          h(TText, { x: x + 1, y, value: '还没有发布作品，kdanmu upload 后再来 →', style: { dim: true } }),
        )
      } else {
        const dataX = x + 18
        const maxRows = Math.max(1, props.rows - y - 2)
        const list = props.profile.effects.slice(0, maxRows)
        for (const fx of list) {
          const name = truncateWidth(fx.name, 16)
          const data = `赞${fmtNum(fx.likes)} 币${fmtNum(fx.coins)} 藏${fmtNum(fx.favorites)} 创${fmtNum(fx.remixes)}`
          children.push(h(TText, { x: x + 1, y, value: name, style: { fg: 'whiteBright' } }))
          children.push(h(TText, { x: dataX, y, value: truncateWidth(data, maxX - dataX), style: { fg: 'gray' } }))
          y += 1
        }
        if (props.profile.effects.length > list.length) {
          children.push(
            h(TText, { x: x + 1, y, value: `…还有 ${props.profile.effects.length - list.length} 个`, style: { dim: true } }),
          )
        }
      }

      // 底部提示
      children.push(h(TText, { x: 2, y: props.rows - 2, value: 'q / Esc 返回主菜单', style: { dim: true } }))

      return h(TBox, { x: 0, y: 0, w: props.cols, h: props.rows, border: false }, () => children)
    }
  },
})
