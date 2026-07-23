import { AdeSessionRepository } from '@/server/repositories/adeSession.repository'
import type { AdeSessionPayload, AdeSessionDto } from '@/types'

function toDto(row: { targetKey: string; payloadJson: string; updatedAt: Date }): AdeSessionDto {
  const parsed = JSON.parse(row.payloadJson) as AdeSessionPayload
  return {
    targetKey: row.targetKey,
    payload: parsed,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const AdeSessionService = {
  async get(ownerId: number, targetKey: string): Promise<AdeSessionDto | null> {
    const row = await AdeSessionRepository.findOwned(ownerId, targetKey)
    return row ? toDto(row) : null
  },

  async save(ownerId: number, targetKey: string, payload: AdeSessionPayload): Promise<AdeSessionDto> {
    const row = await AdeSessionRepository.upsert({
      ownerId,
      targetKey,
      payloadJson: JSON.stringify(payload),
    })
    return toDto(row)
  },
}
