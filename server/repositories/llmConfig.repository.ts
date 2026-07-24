import { getRepo } from '@/server/database/data-source'
import type { LlmConfig } from '@/server/database/entities/llmConfig.entity'

// 懒初始化连接并按表名取 Repository（见 data-source.ts 注释）
const repo = () => getRepo<LlmConfig>('user_llm_configs')

export const LlmConfigRepository = {
  findByUser: async (userId: number) => (await repo()).findOneBy({ userId }),
  /** 按 userId 插入或更新（每用户单行）。 */
  upsert: async (
    userId: number,
    fields: { provider: string; baseUrl: string; apiKeyEncrypted: string; model: string; thinking: string },
  ): Promise<LlmConfig> => {
    const existing = await (await repo()).findOneBy({ userId })
    if (existing) {
      await (await repo()).update({ userId }, { ...fields, updatedAt: new Date() })
      return (await (await repo()).findOneBy({ userId }))!
    }
    return (await repo()).save((await repo()).create({ userId, ...fields }))
  },
  deleteByUser: async (userId: number) => (await repo()).delete({ userId }),
}
