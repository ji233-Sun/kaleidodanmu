import { HttpError } from '@/server/utils/errors'
import { UserRepository } from '@/server/repositories/user.repository'
import { hashPassword, verifyPassword } from '@/server/utils/crypto'
import { signSessionToken } from '@/server/utils/jwt'
import type { AuthUserDto } from '@/types'
import type { User } from '@/server/database/entities/user.entity'

export function toAuthUser(u: User): AuthUserDto {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  }
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
    return { user: toAuthUser(user), token: signSessionToken(user.id) }
  },

  async login(email: string, password: string) {
    const user = await UserRepository.findByEmail(email)
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, 'invalid_credentials', 'Invalid email or password')
    }
    return { user: toAuthUser(user), token: signSessionToken(user.id) }
  },
}
