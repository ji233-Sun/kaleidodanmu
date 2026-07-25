// kdanmu 交互式主页的 Vue 组件（h() 渲染，不依赖 SFC 编译）。
// 左侧是三维点云 logo 动画区（由外部驱动直接写终端 buffer），右侧是状态与菜单。

import { computed, defineComponent, h, type PropType } from 'vue'
import { TBox, TSelect, TText } from '@simon_he/vue-tui'

export type AuthState = 'loading' | 'guest' | 'authed'

export interface HomeState {
  auth: AuthState
  email?: string
  baseUrl?: string
}

export type HomeAction =
  | 'login'
  | 'init'
  | 'dev'
  | 'build'
  | 'validate'
  | 'upload'
  | 'publish'
  | 'effects'
  | 'community'
  | 'docs'
  | 'quit'

export interface HomeLayout {
  /** 动画区域（绝对坐标，方形边框的内容区），null 表示终端太小不显示动画 */
  anim: { x: number; y: number; w: number; h: number } | null
  menuX: number
  menuY: number
  menuW: number
  menuH: number
}

export function computeLayout(cols: number, rows: number, optionCount: number): HomeLayout {
  // 顶部动画 + 下方居中菜单。动画区是横向长条（像素立体字一行 71 列，要够宽才放得下）。
  const menuW = Math.min(cols - 4, 64)
  const menuX = Math.max(2, Math.floor((cols - menuW) / 2))
  // 预留：标题 3 行 + 状态/间隔 2 行 + 菜单 optionCount 行 + 底部提示 3 行
  const animW = Math.min(cols - 8, 108)
  const animH = Math.min(11, rows - 8 - optionCount)
  const showAnim = animW >= 74 && animH >= 8
  if (!showAnim) {
    return { anim: null, menuX, menuY: 4, menuW, menuH: Math.min(optionCount + 2, rows - 8) }
  }
  const anim = { x: Math.max(1, Math.floor((cols - animW) / 2)), y: 3, w: animW, h: animH }
  const menuY = anim.y + anim.h + 2 // 状态行夹在动画与菜单之间
  return {
    anim,
    menuX,
    menuY,
    menuW,
    menuH: Math.min(optionCount + 2, rows - menuY - 3),
  }
}

interface MenuOption {
  label: string
  value: HomeAction
  detail?: string
  disabled?: boolean
}

export function buildOptions(state: HomeState, inProject: boolean): MenuOption[] {
  const opts: MenuOption[] = []
  if (state.auth === 'guest') {
    opts.push({ value: 'login', label: '登录', detail: '浏览器 OAuth 授权' })
  }
  opts.push({ value: 'init', label: '新建 Effect 工程', detail: 'kdanmu init' })
  const needProject = !inProject
  const projectDetail = needProject ? '需在 Effect 工程目录运行' : undefined
  opts.push(
    { value: 'dev', label: '本地开发预览', detail: projectDetail ?? 'kdanmu dev', disabled: needProject },
    { value: 'build', label: '构建', detail: projectDetail ?? 'kdanmu build', disabled: needProject },
    { value: 'validate', label: '校验产物', detail: projectDetail ?? 'kdanmu validate', disabled: needProject },
  )
  if (state.auth === 'authed') {
    opts.push(
      { value: 'upload', label: '上传版本', detail: projectDetail ?? 'kdanmu upload', disabled: needProject },
      { value: 'publish', label: '发布到 staging', detail: projectDetail ?? 'kdanmu publish', disabled: needProject },
      { value: 'effects', label: '我的作品', detail: '查看云端 Effect 列表' },
      { value: 'community', label: '我的弹幕社区状态', detail: 'TUI 演示弹幕与社区数据' },
    )
  }
  opts.push(
    { value: 'docs', label: '图文教程', detail: '浏览器打开 get-started' },
    { value: 'quit', label: '退出' },
  )
  return opts
}

export const HomeApp = defineComponent({
  name: 'KdanmuHome',
  props: {
    cols: { type: Number, required: true },
    rows: { type: Number, required: true },
    version: { type: String, required: true },
    inProject: { type: Boolean, required: true },
    state: { type: Object as PropType<HomeState>, required: true },
    onAction: { type: Function as PropType<(a: HomeAction) => void>, required: true },
  },
  setup(props) {
    const options = computed(() => buildOptions(props.state, props.inProject))
    const layout = computed(() => computeLayout(props.cols, props.rows, options.value.length))

    const statusText = computed(() => {
      const s = props.state
      if (s.auth === 'loading') return '正在查询登录状态…'
      if (s.auth === 'authed') return `已登录：${s.email}`
      return '未登录'
    })
    const statusStyle = computed(() =>
      props.state.auth === 'authed' ? { fg: 'greenBright' } : { fg: 'yellowBright' },
    )

    return () => {
      const l = layout.value
      const hintY = props.rows - 3
      // 根容器不带边框：子组件坐标与动画驱动使用的绝对坐标保持一致（origin 0,0）
      return h(TBox, { x: 0, y: 0, w: props.cols, h: props.rows, border: false }, () => [
        h(TText, { x: 2, y: 1, value: '◆ kdanmu', style: { fg: '#8b48b9', bold: true } }),
        h(TText, { x: 12, y: 1, value: `v${props.version}`, style: { dim: true } }),
        // 顶部像素立体字动画区（内容区由外部动画驱动逐帧写入）
        ...(l.anim
          ? [
              h(TBox, {
                x: l.anim.x - 1,
                y: l.anim.y - 1,
                w: l.anim.w + 2,
                h: l.anim.h + 2,
                border: true,
                style: { fg: '#30345e' },
              }),
            ]
          : []),
        h(TText, {
          x: l.menuX,
          y: l.menuY - 1,
          w: l.menuW,
          value: `${statusText.value} · ${props.inProject ? 'Effect 工程' : '非 Effect 工程'}`,
          style: statusStyle.value,
        }),
        h(TSelect, {
          x: l.menuX,
          y: l.menuY,
          w: l.menuW,
          h: l.menuH,
          options: options.value,
          autoFocus: true,
          valueMode: 'value',
          typeahead: false,
          highlightStyle: { fg: '#15a9ef', bold: true },
          // 注意：TSelect 单选模式下方向键也会触发 update:modelValue，
          // 只有 Enter/点击会触发 change（载荷为 label），动作只能挂在 change 上
          onChange: (label: unknown) => {
            const opt = options.value.find((o) => o.label === label)
            if (opt && !opt.disabled) props.onAction(opt.value)
          },
        }),
        h(TText, {
          x: 2,
          y: hintY,
          value: '↑↓ 选择 · Enter 确认 · q 退出',
          style: { dim: true },
        }),
        h(TText, {
          x: 2,
          y: hintY + 1,
          value: '效果 · 创作 · 连接  EFFECT · CREATE · CONNECT',
          style: { fg: '#6665c9', dim: true },
        }),
      ])
    }
  },
})
