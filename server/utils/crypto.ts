import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LEN = 64

/** 返回 `salt:hash`，均十六进制。 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LEN).toString('hex')
  return `${salt}:${hash}`
}

/** 恒定时间比较，避免时序侧信道。 */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const computed = scryptSync(password, salt, KEY_LEN)
  const expected = Buffer.from(hash, 'hex')
  return computed.length === expected.length && timingSafeEqual(computed, expected)
}

/** URL 安全的随机 token（base64url）。 */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}
