import { z } from 'zod'

/** 用户名（handle）：3-20 位小写字母、数字或连字符。 */
export const HandleSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{3,20}$/, '用户名需为 3-20 位小写字母、数字或连字符')

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
})
export type LoginRequest = z.infer<typeof LoginSchema>

export const RegisterSchema = LoginSchema.extend({
  name: HandleSchema.optional(),
})
export type RegisterRequest = z.infer<typeof RegisterSchema>

/** 不含密码哈希的用户视图。 */
export interface AuthUserDto {
  id: number
  email: string
  name: string
  displayName: string
  avatarHue: string
  bio: string
  role: string
  createdAt: string
}

export interface AuthResponse {
  user: AuthUserDto
}
