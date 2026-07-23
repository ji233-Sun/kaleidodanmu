import { createHash, randomBytes } from 'node:crypto'
import { describe, beforeAll, afterAll, it, expect } from 'vitest'
import { useBackend, uniq, type Backend } from './helpers/backend'

/** PKCE 工具：生成 verifier / S256 challenge。 */
function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

const REDIRECT_URI = 'http://127.0.0.1:45678/callback'
const SCOPES = ['profile:read', 'effects:read']

describe('oauth routes（Authorization Code + PKCE）', () => {
  let b: Backend
  let register: typeof import('@/app/api/auth/register/route')
  let me: typeof import('@/app/api/auth/me/route')
  let authorize: typeof import('@/app/api/oauth/authorize/route')
  let token: typeof import('@/app/api/oauth/token/route')

  beforeAll(async () => {
    b = await useBackend()
    ;[register, me, authorize, token] = await Promise.all([
      import('@/app/api/auth/register/route'),
      import('@/app/api/auth/me/route'),
      import('@/app/api/oauth/authorize/route'),
      import('@/app/api/oauth/token/route'),
    ])
  })
  afterAll(async () => {
    await b.cleanup()
  })

  function jsonReq(url: string, method: string, body: unknown, sessionToken?: string): Request {
    const headers = new Headers({ 'content-type': 'application/json' })
    if (sessionToken) headers.set('cookie', `${b.SESSION_COOKIE}=${encodeURIComponent(sessionToken)}`)
    return new Request(url, { method, body: JSON.stringify(body), headers })
  }

  async function registerUser(): Promise<string> {
    const res = await register.POST(
      jsonReq('http://x/api/auth/register', 'POST', { email: `${uniq('o')}@test.local`, password: '12345678' }),
    )
    expect(res.status).toBe(201)
    const cookie = res.headers.get('set-cookie')!
    return decodeURIComponent(cookie.match(new RegExp(`${b.SESSION_COOKIE}=([^;]+)`))![1])
  }

  async function issueCode(sessionToken: string, redirectUri = REDIRECT_URI) {
    const { verifier, challenge } = pkce()
    const res = await authorize.POST(
      jsonReq('http://x/api/oauth/authorize', 'POST', {
        clientId: 'kaleido-cli',
        redirectUri,
        scopes: SCOPES,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      }, sessionToken),
    )
    return { res, verifier }
  }

  it('未登录调 authorize 返回 401', async () => {
    const { challenge } = pkce()
    const res = await authorize.POST(
      jsonReq('http://x/api/oauth/authorize', 'POST', {
        clientId: 'kaleido-cli',
        redirectUri: REDIRECT_URI,
        scopes: SCOPES,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      }),
    )
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('unauthorized')
  })

  it('非 loopback redirect_uri 被拒绝', async () => {
    const session = await registerUser()
    const { res } = await issueCode(session, 'https://evil.example.com/callback')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_redirect_uri')
  })

  it('未知 scope 被拒绝', async () => {
    const session = await registerUser()
    const { challenge } = pkce()
    const res = await authorize.POST(
      jsonReq('http://x/api/oauth/authorize', 'POST', {
        clientId: 'kaleido-cli',
        redirectUri: REDIRECT_URI,
        scopes: ['admin:all'],
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      }, session),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_scope')
  })

  it('全链路：authorize -> token -> Bearer 调 /api/auth/me', async () => {
    const session = await registerUser()
    const { res, verifier } = await issueCode(session)
    expect(res.status).toBe(201)
    const { code } = await res.json()
    expect(code).toMatch(/^kdc_/)

    const tokenRes = await token.POST(
      jsonReq('http://x/api/oauth/token', 'POST', {
        grantType: 'authorization_code',
        clientId: 'kaleido-cli',
        code,
        redirectUri: REDIRECT_URI,
        codeVerifier: verifier,
      }),
    )
    expect(tokenRes.status).toBe(200)
    const body = await tokenRes.json()
    expect(body.token_type).toBe('Bearer')
    expect(body.access_token).toMatch(/^kdt_/)
    expect(body.scope).toBe(SCOPES.join(' '))

    const meRes = await me.GET(
      new Request('http://x/api/auth/me', {
        headers: { authorization: `Bearer ${body.access_token}` },
      }),
    )
    expect(meRes.status).toBe(200)
    expect((await meRes.json()).user.email).toContain('@test.local')
  })

  it('错误的 code_verifier 换不到令牌', async () => {
    const session = await registerUser()
    const { res } = await issueCode(session)
    const { code } = await res.json()

    const tokenRes = await token.POST(
      jsonReq('http://x/api/oauth/token', 'POST', {
        grantType: 'authorization_code',
        clientId: 'kaleido-cli',
        code,
        redirectUri: REDIRECT_URI,
        codeVerifier: randomBytes(32).toString('base64url'),
      }),
    )
    expect(tokenRes.status).toBe(400)
    expect((await tokenRes.json()).error.code).toBe('invalid_grant')
  })

  it('授权码一次性：重放被拒绝', async () => {
    const session = await registerUser()
    const { res, verifier } = await issueCode(session)
    const { code } = await res.json()

    const exchange = () =>
      token.POST(
        jsonReq('http://x/api/oauth/token', 'POST', {
          grantType: 'authorization_code',
          clientId: 'kaleido-cli',
          code,
          redirectUri: REDIRECT_URI,
          codeVerifier: verifier,
        }),
      )
    expect((await exchange()).status).toBe(200)
    const replay = await exchange()
    expect(replay.status).toBe(400)
    expect((await replay.json()).error.code).toBe('invalid_grant')
  })

  it('伪造的 Bearer token 调 /api/auth/me 返回 401', async () => {
    const res = await me.GET(
      new Request('http://x/api/auth/me', {
        headers: { authorization: 'Bearer kdt_not-a-real-token' },
      }),
    )
    expect(res.status).toBe(401)
  })
})
