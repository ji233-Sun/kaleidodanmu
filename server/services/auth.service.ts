import { HttpError } from '@/server/utils/errors'
import { UserRepository } from '@/server/repositories/user.repository'
import { SessionRepository } from '@/server/repositories/session.repository'
import { hashPassword, verifyPassword, randomToken } from '@/server/utils/crypto'
import type { AuthUserDto } from '@/types'
import type { User } from '@/server/database/entities/user.entity'

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 天

export function toAuthUser(u: User): AuthUserDto {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  }
}

async function createSession(userId: number): Promise<string> {
  const token = randomToken(32)
  await SessionRepository.create({
    id: token,
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  })
  return token
}

export const AuthService = {
  async register(email: string, password: string) {
    if (await UserRepository.findByEmail(email)) {
      throw new HttpError(409, 'email_taken', 'Email already registered')
    }
    const user = await UserRepository.create({
      email,
      passwordHash: hashPassword(password),
    })
    const token = await createSession(user.id)
    return { user: toAuthUser(user), token }
  },

  async login(email: string, password: string) {
    const user = await UserRepository.findByEmail(email)
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, 'invalid_credentials', 'Invalid email or password')
    }
    const token = await createSession(user.id)
    return { user: toAuthUser(user), token }
  },

  async logout(token: string | null) {
    if (token) await SessionRepository.delete(token)
  },
}
