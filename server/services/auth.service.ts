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
    name: u.name,
    displayName: u.displayName,
    avatarHue: u.avatarHue,
    bio: u.bio,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  }
}

export const AuthService = {
  async register(email: string, password: string, name?: string) {
    if (await UserRepository.findByEmail(email)) {
      throw new HttpError(409, 'email_taken', 'Email already registered')
    }
    if (name && (await UserRepository.findByName(name))) {
      throw new HttpError(409, 'name_taken', 'Username already taken')
    }
    const user = await UserRepository.create({
      email,
      passwordHash: hashPassword(password),
      name,
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
