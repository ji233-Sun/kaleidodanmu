import { describe, it, expect } from 'vitest'
import { readCookie, SESSION_COOKIE } from '@/server/utils/cookies'

describe('readCookie', () => {
  it('读取存在的 cookie', () => {
    const req = new Request('http://x/api', {
      headers: { cookie: `${SESSION_COOKIE}=abc; other=1` },
    })
    expect(readCookie(req, SESSION_COOKIE)).toBe('abc')
  })

  it('无 cookie 头返回 null', () => {
    expect(readCookie(new Request('http://x/api'), SESSION_COOKIE)).toBe(null)
  })

  it('目标 cookie 不存在返回 null', () => {
    const req = new Request('http://x/api', { headers: { cookie: 'other=1' } })
    expect(readCookie(req, SESSION_COOKIE)).toBe(null)
  })

  it('URL 编码值正确解码', () => {
    const val = 'a+b/c='
    const req = new Request('http://x/api', {
      headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(val)}` },
    })
    expect(readCookie(req, SESSION_COOKIE)).toBe(val)
  })
})
