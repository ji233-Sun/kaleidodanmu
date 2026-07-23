import { createHash } from 'node:crypto'
import { ApiTokenRepository } from '@/server/repositories/apiToken.repository'
import { randomToken } from '@/server/utils/crypto'
import type { ApiTokenDto, CreatedApiTokenDto } from '@/types'
import type { ApiToken } from '@/server/database/entities/apiToken.entity'

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 90 // 90 天

export function toTokenDto(t: ApiToken): ApiTokenDto {
  return {
    id: t.id,
    userId: t.userId,
    scopes: t.scopes ? (JSON.parse(t.scopes) as string[]) : [],
    expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
    revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export const TokenService = {
  async list(userId: number) {
    const tokens = await ApiTokenRepository.findAllByUser(userId)
    return tokens.map(toTokenDto)
  },

  async create(userId: number, scopes: string[], expiresInDays?: number) {
    // 明文只返回这一次；库里只存哈希。
    const raw = `kdt_${randomToken(32)}`
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000)
      : new Date(Date.now() + TOKEN_TTL_MS)
    const saved = await ApiTokenRepository.create({
      userId,
      tokenHash: hashToken(raw),
      scopes: JSON.stringify(scopes),
      expiresAt,
    })
    return { ...toTokenDto(saved), token: raw } satisfies CreatedApiTokenDto
  },

  async revoke(id: number, userId: number) {
    await ApiTokenRepository.revoke(id, userId)
  },
}
