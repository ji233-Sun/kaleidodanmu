import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, randomToken, encryptSecret, decryptSecret } from '@/server/utils/crypto'

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

  it('encryptSecret/decryptSecret 往返还原明文', () => {
    const plaintext = 'sk-test-key-1234567890abcd'
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext)
  })

  it('encryptSecret 密文不含明文且每次不同（随机 iv）', () => {
    const a = encryptSecret('sk-secret')
    const b = encryptSecret('sk-secret')
    expect(a).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/)
    expect(a).not.toBe(b)
    expect(a).not.toContain('sk-secret')
  })

  it('decryptSecret 对篡改的密文抛错（GCM 校验失败）', () => {
    const payload = encryptSecret('sk-secret')
    const [iv, tag, ciphertext] = payload.split(':')
    // 翻转密文最后一个 hex 字符
    const tampered = `${iv}:${tag}:${ciphertext.slice(0, -1)}${ciphertext.endsWith('0') ? '1' : '0'}`
    expect(() => decryptSecret(tampered)).toThrow()
    expect(() => decryptSecret('not-a-valid-payload')).toThrow()
  })
})
