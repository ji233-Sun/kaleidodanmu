// kdanmu login / whoami：Authorization Code + PKCE。
// CLI 在 127.0.0.1 随机端口起本地回调服务器，打开浏览器走授权页，
// 拿到授权码后用 code_verifier 换 API token，存到 ~/.kdanmu/credentials.json。

import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  credentialsPath,
  loadCredentials,
  resolveBaseUrl,
  saveCredentials,
} from './config'

export { resolveBaseUrl } from './config'

const CLIENT_ID = 'kaleido-cli'
// 与 types/oauth.ts 的 SCOPE_CATALOG 对齐（CLI 独立打包，不 import 应用代码）
const SCOPES = ['profile:read', 'effects:read', 'effects:write', 'square:publish']
const CALLBACK_TIMEOUT_MS = 3 * 60 * 1000

interface CallbackResult {
  code: string | null
  state: string | null
  error: string | null
}

interface TokenResponseBody {
  access_token?: string
  expires_in?: number
  scope?: string
  error?: { message?: string }
}

interface MeResponseBody {
  user?: { email: string; id: number }
}

function openBrowser(url: string): boolean {
  try {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
    const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url]
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
    child.unref()
    return true
  } catch {
    return false
  }
}

function callbackHtml(ok: boolean, detail: string): string {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>kdanmu 授权</title>` +
    `<body style="font-family:system-ui;display:flex;min-height:90vh;align-items:center;justify-content:center;margin:0">` +
    `<div style="text-align:center"><h2>${ok ? '授权成功' : '授权未完成'}</h2><p>${detail}</p></div></body></html>`
}

/** 起本地回调服务器，监听 127.0.0.1 随机端口，收到一次 /callback 后 resolve。 */
async function startCallbackServer() {
  let resolveResult!: (r: CallbackResult) => void
  const result = new Promise<CallbackResult>((resolve) => {
    resolveResult = resolve
  })
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== '/callback') {
      res.statusCode = 404
      res.end('not found')
      return
    }
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    const ok = Boolean(code)
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(
      callbackHtml(
        ok,
        ok
          ? '可以关闭此页面，回到终端继续。'
          : error
            ? `已拒绝授权（${error}），可以关闭此页面。`
            : '回调缺少授权码，请重新执行 kdanmu login。',
      ),
    )
    resolveResult({ code, state: url.searchParams.get('state'), error })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { server, port, result }
}

export async function login(options: { baseUrl?: string; open?: boolean }): Promise<void> {
  const baseUrl = resolveBaseUrl(options.baseUrl)
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('base64url')

  const { server, port, result } = await startCallbackServer()
  const redirectUri = `http://127.0.0.1:${port}/callback`
  const authorizeUrl = new URL('/oauth/authorize', baseUrl)
  authorizeUrl.searchParams.set('client_id', CLIENT_ID)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('scope', SCOPES.join(' '))
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', challenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  console.log(`授权地址：${authorizeUrl.toString()}`)
  if (options.open === false || !openBrowser(authorizeUrl.toString())) {
    console.log('请手动在浏览器中打开上面的链接完成授权。')
  }
  console.log('等待浏览器回调…')

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('等待授权超时（3 分钟），请重试')), CALLBACK_TIMEOUT_MS),
  )
  let cb: CallbackResult
  try {
    cb = await Promise.race([result, timeout])
  } finally {
    server.close()
  }
  if (cb.state !== state) throw new Error('state 校验失败，请重新执行 kdanmu login')
  if (!cb.code) throw new Error(cb.error ? `授权被拒绝（${cb.error}）` : '回调缺少授权码')

  const tokenRes = await fetch(`${baseUrl}/api/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grantType: 'authorization_code',
      clientId: CLIENT_ID,
      code: cb.code,
      redirectUri,
      codeVerifier: verifier,
    }),
  })
  const data = (await tokenRes.json().catch(() => null)) as TokenResponseBody | null
  if (!tokenRes.ok || !data?.access_token) {
    throw new Error(`换取令牌失败：${data?.error?.message ?? `HTTP ${tokenRes.status}`}`)
  }

  saveCredentials({
    baseUrl,
    token: data.access_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
    scopes: typeof data.scope === 'string' ? data.scope.split(' ') : [],
  })
  console.log(`登录成功，凭证已保存到 ${credentialsPath()}`)
}

function whoamiFail(json: boolean, code: string, message: string): void {
  if (json) console.log(JSON.stringify({ ok: false, error: { code, message } }))
  else console.error(`错误：${message}`)
  process.exitCode = 1
}

export async function whoami(opts: { json?: boolean } = {}): Promise<void> {
  const json = opts.json ?? false
  const creds = loadCredentials()
  if (!creds) return whoamiFail(json, 'not_logged_in', '未登录，请先执行 kdanmu login')
  let res: Response
  try {
    res = await fetch(`${creds.baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${creds.token}` },
    })
  } catch (e) {
    return whoamiFail(json, 'network_error', `无法连接后端 ${creds.baseUrl}：${e instanceof Error ? e.message : String(e)}`)
  }
  const data = (await res.json().catch(() => null)) as MeResponseBody | null
  if (!res.ok || !data?.user) {
    return whoamiFail(
      json,
      res.status === 401 ? 'unauthorized' : 'error',
      res.status === 401 ? '凭证已失效，请重新执行 kdanmu login' : `查询失败：HTTP ${res.status}`,
    )
  }
  if (json) {
    console.log(JSON.stringify({ ok: true, user: data.user, baseUrl: creds.baseUrl, scopes: creds.scopes }))
  } else {
    console.log(`已登录：${data.user.email}（id: ${data.user.id}，${creds.baseUrl}）`)
  }
}
