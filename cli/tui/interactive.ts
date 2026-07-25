// kdanmu 无参入口的交互式主页：vue-tui 渲染菜单，three.js 点云动画直接写终端 buffer。
// 选中菜单项后拆除 TUI、在普通终端环境执行对应命令，结束后按 Enter 回到主页。

import { appendFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { reactive } from 'vue'
import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
} from '@simon_he/vue-tui/cli'
import { login } from '../auth'
import { createClient, type MyProfile } from '../api'
import { buildCmd, devCmd, initCmd, publishCmd, uploadCmd, validateCmd } from '../commands'
import { loadCredentials, resolveBaseUrl } from '../config'
import { hasManifest } from '../project'
import { buildOptions, computeLayout, HomeApp, type HomeAction, type HomeState } from './home-app'
import { PixelTextAnimation } from './pixel-text-animation'
import { CommunityApp, computeCommunityLayout, DanmakuStrip } from './community-app'

const FRAME_MS = 50

// 调试：KDANMU_TUI_DEBUG=<文件> 时输出带时间戳的内部事件
const dbgFile = process.env.KDANMU_TUI_DEBUG
const tlog = (msg: string) => {
  if (dbgFile) appendFileSync(dbgFile, `${Date.now()} ${msg}\n`)
}

/** 查询登录态（不打印、不退出），供主页状态栏使用。 */
async function fetchAuthState(): Promise<HomeState> {
  const creds = loadCredentials()
  if (!creds) return { auth: 'guest' }
  try {
    const res = await fetch(`${creds.baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${creds.token}` },
      signal: AbortSignal.timeout(4000),
    })
    const data = (await res.json().catch(() => null)) as { user?: { email: string } } | null
    if (res.ok && data?.user) return { auth: 'authed', email: data.user.email, baseUrl: creds.baseUrl }
  } catch {
    // 网络失败按未登录展示，用户仍可使用本地功能
  }
  return { auth: 'guest' }
}

/** 挂载一次主页，直到用户选中某个动作（或退出）后拆除 TUI 并 resolve。 */
function mountHome(state: HomeState, version: string): Promise<HomeAction> {
  return new Promise((resolvePromise) => {
    let settled = false
    let timer: ReturnType<typeof setInterval> | null = null
    let terminalCleanup: { uninstall: () => void } | null = null
    let driver: { dispose: () => void } | null = null

    const cleanup = () => {
      if (timer) clearInterval(timer)
      terminalCleanup?.uninstall()
      driver?.dispose()
      renderer.dispose()
      app.dispose()
    }
    const finish = (a: HomeAction) => {
      if (settled) return
      settled = true
      tlog(`finish: ${a}`)
      cleanup()
      tlog('cleanup done')
      resolvePromise(a)
    }

    const cols = process.stdout.columns || 80
    const rows = process.stdout.rows || 24
    const animation = new PixelTextAnimation()
    const inProject = hasManifest(process.cwd())

    const app = createTerminalApp({
      cols,
      rows,
      component: HomeApp,
      props: {
        cols,
        rows,
        version,
        inProject,
        state,
        onAction: finish,
      },
      defaultStyle: { fg: 'whiteBright' },
    })
    app.mount()

    const renderer = createStdoutRenderer(app.terminal, {
      output: process.stdout,
      hideCursor: true,
      colorMode: 'auto',
    })
    app.scheduler.flush()

    // 点云动画：直接写终端 buffer 的动画区域，20fps。
    // 每帧按当前终端尺寸重算布局，resize（或 0×0 的异常 pty）不会越界崩溃。
    timer = setInterval(() => {
      try {
        const size = app.terminal.size()
        // 与 HomeApp 用同一套布局参数，保证动画落在边框内容区里
        const anim = computeLayout(size.cols, size.rows, buildOptions(state, inProject).length).anim
        if (!anim) return
        const ops = animation.frame(Date.now(), anim.w, anim.h)
        app.terminal.batch(() => {
          app.terminal.fill(anim.x, anim.y, anim.w, anim.h, ' ')
          for (const op of ops) app.terminal.put(anim.x + op.x, anim.y + op.y, op.ch, { fg: op.fg, bg: op.bg })
        })
        app.terminal.commit()
      } catch {
        // 尺寸突变等瞬时异常跳过本帧
      }
    }, FRAME_MS)

    terminalCleanup = installTerminalCleanup(cleanup, { signalPolicy: 'reraise' })
    driver = createStdinDriver({
      dispatch(event) {
        // Ctrl+C 直接退出：raw 模式下不触发 SIGINT，需拦截 \x03 对应的 keydown；
        // 显式处理避免被 Vue 事件系统吞掉后 onExit 不触发。
        if (event.type === 'keydown' && event.ctrlKey && (event.key === 'c' || event.key === 'C')) {
          finish('quit')
          return true
        }
        // q 直接退出（主页没有文本输入场景）
        if (event.type === 'keydown' && (event.key === 'q' || event.key === 'Q')) {
          finish('quit')
          return true
        }
        const prevented = app.events.dispatch(event)
        app.scheduler.flush()
        return prevented
      },
      enableMouse: false,
      onExit: () => finish('quit'),
    })
  })
}

/** 挂载「我的弹幕社区状态」TUI：资料/总览/作品面板 + 顶部滚动弹幕条，按 q/Esc 返回。 */
function mountCommunity(profile: MyProfile): Promise<void> {
  return new Promise((resolvePromise) => {
    let settled = false
    let timer: ReturnType<typeof setInterval> | null = null
    let terminalCleanup: { uninstall: () => void } | null = null
    let driver: { dispose: () => void } | null = null

    const cleanup = () => {
      if (timer) clearInterval(timer)
      terminalCleanup?.uninstall()
      driver?.dispose()
      renderer.dispose()
      app.dispose()
    }
    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolvePromise()
    }

    const cols = process.stdout.columns || 80
    const rows = process.stdout.rows || 24
    const strip = new DanmakuStrip(
      profile.effects.map((e) => e.name),
      Date.now() & 0xffffffff,
    )

    const app = createTerminalApp({
      cols,
      rows,
      component: CommunityApp,
      props: { cols, rows, profile },
      defaultStyle: { fg: 'whiteBright' },
    })
    app.mount()

    const renderer = createStdoutRenderer(app.terminal, {
      output: process.stdout,
      hideCursor: true,
      colorMode: 'auto',
    })
    app.scheduler.flush()

    // 弹幕条：每帧按当前尺寸重算内容区，fill 清空后 put 本帧字符
    timer = setInterval(() => {
      try {
        const size = app.terminal.size()
        const layout = computeCommunityLayout(size.cols, size.rows)
        if (!layout.strip) return
        const { x, y, w, h } = layout.strip
        const ops = strip.frame(w, h)
        app.terminal.batch(() => {
          app.terminal.fill(x, y, w, h, ' ')
          for (const op of ops) app.terminal.put(x + op.x, y + op.y, op.ch, { fg: op.fg })
        })
        app.terminal.commit()
      } catch {
        // 尺寸突变等瞬时异常跳过本帧
      }
    }, FRAME_MS)

    terminalCleanup = installTerminalCleanup(cleanup, { signalPolicy: 'reraise' })
    driver = createStdinDriver({
      dispatch(event) {
        if (event.type === 'keydown' && event.ctrlKey && (event.key === 'c' || event.key === 'C')) {
          finish()
          return true
        }
        if (
          event.type === 'keydown' &&
          (event.key === 'q' || event.key === 'Q' || event.key === 'Escape')
        ) {
          finish()
          return true
        }
        const prevented = app.events.dispatch(event)
        app.scheduler.flush()
        return prevented
      },
      enableMouse: false,
      onExit: () => finish(),
    })
  })
}

function promptLine(question: string): Promise<string> {
  // stdin driver dispose 时会 unref stdin，重新 ref 否则事件轮空进程直接退出
  process.stdin.ref()
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  tlog('promptLine open')
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close()
      tlog(`promptLine answer: ${answer}`)
      resolve(answer.trim())
    }),
  )
}

function waitEnter(): Promise<void> {
  process.stdout.write('\n按 Enter 返回主菜单…')
  process.stdin.ref()
  return new Promise((resolve) => {
    process.stdin.resume()
    process.stdin.once('data', () => resolve())
  })
}

function openBrowser(url: string): void {
  try {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
    const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url]
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref()
  } catch {
    console.log(`请手动打开：${url}`)
  }
}

/** 在普通终端环境执行菜单动作。返回 true 表示执行后直接退出（如 dev 被 Ctrl+C 终止）。 */
async function runAction(action: HomeAction): Promise<void> {
  process.exitCode = 0
  switch (action) {
    case 'login':
      await login({})
      break
    case 'init': {
      const name = await promptLine('工程名称：')
      if (name) await initCmd(name, {})
      break
    }
    case 'dev':
      await devCmd({})
      break
    case 'build':
      await buildCmd({})
      break
    case 'validate':
      await validateCmd({})
      break
    case 'upload':
      await uploadCmd({})
      break
    case 'publish':
      await publishCmd({ channel: 'staging' })
      break
    case 'effects': {
      const client = createClient()
      const effects = await client.listEffects()
      if (effects.length === 0) console.log('还没有作品，先 kdanmu init 创建一个吧。')
      else {
        console.log(`共 ${effects.length} 个作品：`)
        for (const e of effects) console.log(`  #${e.id}  ${e.slug}  ${e.name ?? ''}`)
      }
      break
    }
    case 'community': {
      const client = createClient()
      const profile = await client.getMyProfile()
      await mountCommunity(profile)
      break
    }
    case 'docs':
      openBrowser(`${resolveBaseUrl()}/get-started`)
      console.log('已在浏览器打开图文教程。')
      break
  }
  process.exitCode = 0
}

/** 无参 `kdanmu` 的交互入口。非 TTY 环境返回 false，由调用方回退到帮助输出。 */
export async function runInteractive(version: string): Promise<boolean> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) return false

  for (;;) {
    const state = reactive<HomeState>({ auth: 'loading' })
    const homePromise = mountHome(state, version)
    // 登录态查询不阻塞首屏
    void fetchAuthState().then((s) => Object.assign(state, s))
    const action = await homePromise
    if (action === 'quit') return true
    try {
      await runAction(action)
    } catch (e) {
      console.error(`错误：${e instanceof Error ? e.message : String(e)}`)
    }
    if (action === 'dev') return true // dev 被中断后直接退出，避免又弹回菜单
    await waitEnter()
  }
}
