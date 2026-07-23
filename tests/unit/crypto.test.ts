import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, randomToken } from '@/server/utils/crypto'

describe('crypto utils', () => {
  it('hashPassword 产出 salt:hex 且不含明文', () => {
    const stored = hashPassword('s3cret-pw')
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
    expect(stored).not.toContain('s3cret-pw')
  })

  it('verifyPassword 正确密码校验通过', () => {
    expect(verifyPassword('hunter2', hashPassword('hunter2'))).toBe(true)
  })

  it('verifyPassword 错误密码返回 false', () => {
    expect(verifyPassword('wrong', hashPassword('hunter2'))).toBe(false)
  })

  it('verifyPassword 对畸形 stored 返回 false', () => {
    expect(verifyPassword('x', 'not-a-valid-hash')).toBe(false)
    expect(verifyPassword('x', '')).toBe(false)
    expect(verifyPassword('x', 'onlysalt')).toBe(false)
  })

  it('相同密码两次哈希不同（随机盐）', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'))
  })

  it('randomToken 足够长且每次不同', () => {
    const a = randomToken()
    const b = randomToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThan(20)
  })
})
