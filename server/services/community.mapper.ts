import type { PublicUserDto, SquareEffectDto, DerivativeDto } from '@/types'
import type { User } from '@/server/database/entities/user.entity'
import type { Effect } from '@/server/database/entities/effect.entity'

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function toPublicUser(u: User): PublicUserDto {
  return {
    id: u.id,
    name: u.name,
    displayName: u.displayName,
    avatarHue: u.avatarHue,
    bio: u.bio,
    createdAt: u.createdAt.toISOString(),
  }
}

export function toSquareEffect(e: Effect, author: PublicUserDto): SquareEffectDto {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    prompt: e.prompt,
    recipe: parseJson(e.recipeJson, {}),
    tags: parseJson<string[]>(e.tagsJson, []),
    author,
    likes: e.likes,
    uses: e.uses,
    remixes: e.remixes,
    coins: e.coins,
    favorites: e.favorites,
    createdAt: e.createdAt.toISOString(),
  }
}

export function toDerivative(e: Effect, author: PublicUserDto): DerivativeDto {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    author,
    likes: e.likes,
    createdAt: e.createdAt.toISOString(),
  }
}

export function sum<T>(arr: T[], key: keyof T): number {
  return arr.reduce((s, x) => s + (Number(x[key]) || 0), 0)
}
