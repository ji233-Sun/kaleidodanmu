import { z } from 'zod'

export interface DraftDto {
  id: number
  effectId: number | null
  ownerId: number
  snapshotJson: string
  updatedAt: string
}

export const SaveDraftSchema = z.object({
  snapshotJson: z.string().max(5_000_000),
})
export type SaveDraftRequest = z.infer<typeof SaveDraftSchema>
