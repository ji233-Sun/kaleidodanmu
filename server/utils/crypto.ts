import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'

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

// AES-256-GCM 密钥：由 sessionSecret 经 scrypt 派生，固定 salt 保证重启后可解密
const SECRET_KEY_SALT = 'kaleido-byok-secret-v1'
const deriveSecretKey = () => scryptSync(env.sessionSecret, SECRET_KEY_SALT, 32)

/** 加密敏感配置（如用户 LLM key），返回 `iv:tag:ciphertext`（均十六进制）。 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveSecretKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`
}

/** encryptSecret 的逆操作；payload 被篡改或格式非法会抛错。 */
export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, ciphertextHex] = payload.split(':')
  if (!ivHex || !tagHex || !ciphertextHex) throw new Error('invalid encrypted secret payload')
  const decipher = createDecipheriv('aes-256-gcm', deriveSecretKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]).toString('utf8')
}
