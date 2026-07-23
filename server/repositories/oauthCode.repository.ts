import { getRepo } from '@/server/database/data-source'
import type { OAuthCode } from '@/server/database/entities/oauthCode.entity'

// 懒初始化连接并按表名取 Repository（见 data-source.ts 注释）
const repo = () => getRepo<OAuthCode>('oauth_codes')

export const OAuthCodeRepository = {
  findByCodeHash: async (codeHash: string) => (await repo()).findOneBy({ codeHash }),
  create: async (
    data: Pick<OAuthCode, 'userId' | 'codeHash' | 'clientId' | 'redirectUri' | 'scopes' | 'codeChallenge' | 'expiresAt'>,
  ) => (await repo()).save((await repo()).create(data)),
  markUsed: async (id: number) => (await repo()).update({ id }, { usedAt: new Date() }),
}
