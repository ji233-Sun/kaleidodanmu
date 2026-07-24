import { describe, beforeAll, afterAll, afterEach, it, expect, vi } from 'vitest'
import { useBackend, uniq, type Backend } from './helpers/backend'

describe('routes (HTTP 层)', () => {
  let b: Backend
  let effects: typeof import('@/app/api/effects/route')
  let register: typeof import('@/app/api/auth/register/route')
  let login: typeof import('@/app/api/auth/login/route')
  let me: typeof import('@/app/api/auth/me/route')
  let logout: typeof import('@/app/api/auth/logout/route')
  let llmConfig: typeof import('@/app/api/user/llm-config/route')
  let llmConfigTest: typeof import('@/app/api/user/llm-config/test/route')
  let llmProxy: typeof import('@/app/api/llm/proxy/route')

  beforeAll(async () => {
    // env 在模块加载时读取，必须先于一切动态 import 设置（useBackend 内部也会加载 env）
    process.env.LLM_BASE_URL = 'http://env-up.test/v1'
    process.env.LLM_API_KEY = 'sk-env-key'
    process.env.LLM_MODEL = 'env-model'
    b = await useBackend()
    ;[effects, register, login, me, logout, llmConfig, llmConfigTest, llmProxy] = await Promise.all([
      import('@/app/api/effects/route'),
      import('@/app/api/auth/register/route'),
      import('@/app/api/auth/login/route'),
      import('@/app/api/auth/me/route'),
      import('@/app/api/auth/logout/route'),
      import('@/app/api/user/llm-config/route'),
      import('@/app/api/user/llm-config/test/route'),
      import('@/app/api/llm/proxy/route'),
    ])
  })
  afterAll(async () => {
    await b.cleanup()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function parseSessionToken(res: Response): string | null {
    const c = res.headers.get('set-cookie')
    if (!c) return null
    const m = c.match(new RegExp(`${b.SESSION_COOKIE}=([^;]+)`))
    return m ? decodeURIComponent(m[1]) : null
  }

  function authed(url: string, token: string, init: RequestInit = {}): Request {
    const headers = new Headers(init.headers)
    headers.set('cookie', `${b.SESSION_COOKIE}=${encodeURIComponent(token)}`)
    return new Request(url, { ...init, headers })
  }

  function jsonReq(url: string, method: string, body: unknown): Request {
    return new Request(url, {
      method,
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  }

  it('未带 cookie 访问 effects 返回 401 unauthorized', async () => {
    const res = await effects.GET(new Request('http://x/api/effects'))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('unauthorized')
  })

  it('register -> me -> 创建 effect -> list 全链路（cookie 透传）', async () => {
    const email = `${uniq('r')}@test.local`
    const regRes = await register.POST(jsonReq('http://x/api/auth/register', 'POST', { email, password: '12345678' }))
    expect(regRes.status).toBe(201)
    const token = parseSessionToken(regRes)
    expect(token).toBeTruthy()
    const user = (await regRes.json()).user
    expect(user.email).toBe(email)

    const meRes = await me.GET(authed('http://x/api/auth/me', token!))
    expect(meRes.status).toBe(200)
    expect((await meRes.json()).user.id).toBe(user.id)

    const slug = uniq('fx')
    const createRes = await effects.POST(
      authed('http://x/api/effects', token!, {
        method: 'POST',
        body: JSON.stringify({ slug, name: 'N' }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(createRes.status).toBe(201)
    expect((await createRes.json()).effect.slug).toBe(slug)

    const listRes = await effects.GET(authed('http://x/api/effects', token!))
    expect(listRes.status).toBe(200)
    expect((await listRes.json()).effects).toHaveLength(1)
  })

  it('错误凭据登录返回 401', async () => {
    const res = await login.POST(jsonReq('http://x/api/auth/login', 'POST', { email: 'no@one.local', password: '12345678' }))
    expect(res.status).toBe(401)
  })

  it('非法入参（密码过短）返回 400', async () => {
    const res = await register.POST(jsonReq('http://x/api/auth/register', 'POST', { email: `${uniq('v')}@t.local`, password: '123' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_request')
  })

  it('register 重复 email 返回 409', async () => {
    const email = `${uniq('dup')}@t.local`
    await register.POST(jsonReq('http://x/api/auth/register', 'POST', { email, password: '12345678' }))
    const res = await register.POST(jsonReq('http://x/api/auth/register', 'POST', { email, password: '12345678' }))
    expect(res.status).toBe(409)
  })

  it('logout 清除 cookie（JWT 无状态，旧 token 在过期前仍有效）', async () => {
    const email = `${uniq('lo')}@t.local`
    const regRes = await register.POST(jsonReq('http://x/api/auth/register', 'POST', { email, password: '12345678' }))
    const token = parseSessionToken(regRes)!

    const outRes = await logout.POST(authed('http://x/api/auth/logout', token, { method: 'POST' }))
    expect(outRes.status).toBe(200)
    expect(outRes.headers.get('set-cookie')).toContain('Max-Age=0')

    // 无状态 JWT 无法服务端吊销：旧 token 仍通过校验，登出依赖客户端丢弃 cookie
    const meRes = await me.GET(authed('http://x/api/auth/me', token))
    expect(meRes.status).toBe(200)
  })

  /* ------------------------------ BYOK ------------------------------ */

  async function registerUser(): Promise<string> {
    const res = await register.POST(
      jsonReq('http://x/api/auth/register', 'POST', { email: `${uniq('byok')}@t.local`, password: '12345678' }),
    )
    return parseSessionToken(res)!
  }

  function stubUpstream(payload: unknown, init: { status?: number } = {}) {
    const mock = vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status: init.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', mock)
    return mock
  }

  const PROXY_BODY = { messages: [{ role: 'user', content: '做一个粒子效果' }] }

  it('llm-config 未登录访问返回 401', async () => {
    const res = await llmConfig.GET(new Request('http://x/api/user/llm-config'))
    expect(res.status).toBe(401)
  })

  it('llm-config GET/PUT/DELETE 往返，key 永不回传完整值', async () => {
    const token = await registerUser()

    const empty = await llmConfig.GET(authed('http://x/api/user/llm-config', token))
    expect((await empty.json()).config).toBe(null)

    const putRes = await llmConfig.PUT(
      authed('http://x/api/user/llm-config', token, {
        method: 'PUT',
        body: JSON.stringify({ provider: 'openai-chat', baseUrl: 'https://user-up.test/v1', apiKey: 'sk-user-key-1234', model: 'user-model' }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(putRes.status).toBe(200)
    const putBody = await putRes.json()
    expect(putBody.config.apiKeyPreview).toBe('••••1234')
    expect(JSON.stringify(putBody)).not.toContain('sk-user-key-1234')

    const getRes = await llmConfig.GET(authed('http://x/api/user/llm-config', token))
    const getBody = await getRes.json()
    expect(getBody.config.model).toBe('user-model')
    expect(getBody.config.apiKeyPreview).toBe('••••1234')

    const delRes = await llmConfig.DELETE(authed('http://x/api/user/llm-config', token, { method: 'DELETE' }))
    expect((await delRes.json()).config).toBe(null)
  })

  it('llm proxy 用户已配置 openai-chat 时打到用户 baseUrl 并带用户 key', async () => {
    const token = await registerUser()
    await llmConfig.PUT(
      authed('http://x/api/user/llm-config', token, {
        method: 'PUT',
        body: JSON.stringify({ provider: 'openai-chat', baseUrl: 'https://user-up.test/v1', apiKey: 'sk-user-key-1234', model: 'user-model' }),
        headers: { 'content-type': 'application/json' },
      }),
    )

    const mock = stubUpstream({ choices: [{ message: { content: '完成', tool_calls: [] } }] })
    const res = await llmProxy.POST(
      authed('http://x/api/llm/proxy', token, {
        method: 'POST',
        body: JSON.stringify(PROXY_BODY),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).message.content).toBe('完成')

    expect(mock).toHaveBeenCalledTimes(1)
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://user-up.test/v1/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-user-key-1234')
    expect(JSON.parse(init.body as string).model).toBe('user-model')
  })

  it('llm proxy 用户已配置 anthropic 时打到 /v1/messages 并带 x-api-key', async () => {
    const token = await registerUser()
    await llmConfig.PUT(
      authed('http://x/api/user/llm-config', token, {
        method: 'PUT',
        body: JSON.stringify({ provider: 'anthropic', baseUrl: 'https://ant.test', apiKey: 'sk-ant-key-5678', model: 'claude-sonnet-4-5' }),
        headers: { 'content-type': 'application/json' },
      }),
    )

    const mock = stubUpstream({
      content: [
        { type: 'text', text: '写入文件' },
        { type: 'tool_use', id: 'tu_1', name: 'validate', input: {} },
      ],
    })
    const res = await llmProxy.POST(
      authed('http://x/api/llm/proxy', token, {
        method: 'POST',
        body: JSON.stringify(PROXY_BODY),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message.content).toBe('写入文件')
    expect(body.message.toolCalls).toEqual([{ id: 'tu_1', name: 'validate', arguments: '{}' }])

    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ant.test/v1/messages')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-ant-key-5678')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(JSON.parse(init.body as string).system).toBeTruthy()
  })

  it('llm proxy 用户未配置时回退 env（openai-chat 形态）', async () => {
    const token = await registerUser()
    const mock = stubUpstream({ choices: [{ message: { content: 'env 完成', tool_calls: [] } }] })
    const res = await llmProxy.POST(
      authed('http://x/api/llm/proxy', token, {
        method: 'POST',
        body: JSON.stringify(PROXY_BODY),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(200)

    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://env-up.test/v1/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-env-key')
    expect(JSON.parse(init.body as string).model).toBe('env-model')
  })

  it('llm-config test 成功返回 ok:true，上游失败返回 ok:false 而非 5xx', async () => {
    const token = await registerUser()
    await llmConfig.PUT(
      authed('http://x/api/user/llm-config', token, {
        method: 'PUT',
        body: JSON.stringify({ provider: 'openai-chat', baseUrl: 'https://user-up.test/v1', apiKey: 'sk-user-key-1234', model: 'user-model' }),
        headers: { 'content-type': 'application/json' },
      }),
    )

    // apiKey 留空 → 用已保存的 key 测试
    let mock = stubUpstream({ choices: [{ message: { content: 'pong' } }] })
    let res = await llmConfigTest.POST(
      authed('http://x/api/user/llm-config/test', token, {
        method: 'POST',
        body: JSON.stringify({ provider: 'openai-chat', baseUrl: 'https://user-up.test/v1', apiKey: '', model: 'user-model' }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    let [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://user-up.test/v1/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-user-key-1234')

    mock = stubUpstream({ error: { message: 'invalid api key' } }, { status: 401 })
    res = await llmConfigTest.POST(
      authed('http://x/api/user/llm-config/test', token, {
        method: 'POST',
        body: JSON.stringify({ provider: 'openai-chat', baseUrl: 'https://user-up.test/v1', apiKey: 'sk-bad', model: 'user-model' }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.message).toContain('HTTP 401')
    expect(body.message).toContain('invalid api key')
    ;[url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-bad')
  })
})
