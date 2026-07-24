import { getRepo } from '@/server/database/data-source'
import { randomToken } from '@/server/utils/crypto'
import type { User } from '@/server/database/entities/user.entity'

const AVATAR_HUES = ['#00a1d6', '#fb7299', '#8b7cf6', '#00f0ff', '#ff9f29', '#7ee0a3', '#9aa3b2']

function pickAvatarHue(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_HUES[h % AVATAR_HUES.length]
}

const sanitizeHandle = (s: string): string => s.toLowerCase().replace(/[^a-z0-9-]/g, '')

const repo = () => getRepo<User>('users')

/** 生成不重复 handle；身份字段由数据层负责，auth 层不感知。 */
async function ensureUniqueHandle(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const name = sanitizeHandle(`u${randomToken(3)}`) || `u${Date.now().toString(36)}`
    if (!(await (await repo()).findOneBy({ name }))) return name
  }
  return `u${Date.now().toString(36)}`
}

export const UserRepository = {
  findById: async (id: number) => (await repo()).findOneBy({ id }),
  findByEmail: async (email: string) => (await repo()).findOneBy({ email }),
  findByName: async (name: string) => (await repo()).findOneBy({ name }),

  /** 创建用户；未指定 name 时由数据层自动生成唯一 handle。 */
  create: async (data: Pick<User, 'email' | 'passwordHash'> & { name?: string }) => {
    const name = data.name ?? (await ensureUniqueHandle())
    const r = await repo()
    return r.save(
      r.create({
        email: data.email,
        passwordHash: data.passwordHash,
        role: 'creator',
        name,
        displayName: name,
        avatarHue: pickAvatarHue(name),
      }),
    )
  },

  updateProfile: async (
    id: number,
    data: Partial<Pick<User, 'displayName' | 'avatarHue' | 'bio'>>,
  ) => (await repo()).update(id, data),

  /** 粉丝 / 关注计数自增自减（关注关系变更时维护）。 */
  bumpCount: async (
    id: number,
    column: 'followersCount' | 'followingCount',
    delta: 1 | -1,
  ) =>
    delta > 0
      ? (await repo()).increment({ id }, column, delta)
      : (await repo()).decrement({ id }, column, -delta),
}
