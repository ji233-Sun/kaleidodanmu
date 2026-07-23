import { describe, beforeAll, afterAll, it, expect } from 'vitest'
import { useBackend, uniq, type Backend } from './helpers/backend'

describe('routes (HTTP 层)', () => {
  let b: Backend
  let effects: typeof import('@/app/api/effects/route')
  let register: typeof import('@/app/api/auth/register/route')
  let login: typeof import('@/app/api/auth/login/route')
  let me: typeof import('@/app/api/auth/me/route')
  let logout: typeof import('@/app/api/auth/logout/route')

  beforeAll(async () => {
    b = await useBackend()
    ;[effects, register, login, me, logout] = await Promise.all([
      import('@/app/api/effects/route'),
      import('@/app/api/auth/register/route'),
      import('@/app/api/auth/login/route'),
      import('@/app/api/auth/me/route'),
      import('@/app/api/auth/logout/route'),
    ])
  })
  afterAll(async () => {
    await b.cleanup()
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

  it('logout 清除 cookie，之后 cookie 失效', async () => {
    const email = `${uniq('lo')}@t.local`
    const regRes = await register.POST(jsonReq('http://x/api/auth/register', 'POST', { email, password: '12345678' }))
    const token = parseSessionToken(regRes)!

    const outRes = await logout.POST(authed('http://x/api/auth/logout', token, { method: 'POST' }))
    expect(outRes.status).toBe(200)
    expect(outRes.headers.get('set-cookie')).toContain('Max-Age=0')

    const meRes = await me.GET(authed('http://x/api/auth/me', token))
    expect(meRes.status).toBe(401)
  })
})
