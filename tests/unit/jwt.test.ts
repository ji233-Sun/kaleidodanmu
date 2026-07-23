import { describe, it, expect } from 'vitest'
import { signSessionToken, verifySessionToken, SESSION_TTL_S } from '@/server/utils/jwt'

describe('jwt', () => {
  it('签发后可校验，sub/iat/exp 正确', () => {
    const before = Math.floor(Date.now() / 1000)
    const token = signSessionToken(42)
    const claims = verifySessionToken(token)
    expect(claims?.sub).toBe(42)
    expect(claims!.exp - claims!.iat).toBe(SESSION_TTL_S)
    expect(claims!.iat).toBeGreaterThanOrEqual(before)
  })

  it('篡改 payload 后签名校验失败', () => {
    const token = signSessionToken(42)
    const [header, , sig] = token.split('.')
    const forged = `${header}.${Buffer.from(JSON.stringify({ sub: 1, iat: 0, exp: 9999999999 })).toString('base64url')}.${sig}`
    expect(verifySessionToken(forged)).toBe(null)
  })

  it('过期令牌返回 null', () => {
    expect(verifySessionToken(signSessionToken(42, -10))).toBe(null)
  })

  it('格式非法返回 null', () => {
    expect(verifySessionToken('not-a-jwt')).toBe(null)
    expect(verifySessionToken('a.b.c.d')).toBe(null)
    expect(verifySessionToken('')).toBe(null)
  })

  it('alg 非 HS256 拒绝', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: 42, iat: 0, exp: 9999999999 })).toString('base64url')
    expect(verifySessionToken(`${header}.${payload}.x`)).toBe(null)
  })
})
