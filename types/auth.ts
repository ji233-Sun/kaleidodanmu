import { z } from 'zod'

export const RegisterSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
})
export type RegisterRequest = z.infer<typeof RegisterSchema>

export const LoginSchema = RegisterSchema
export type LoginRequest = z.infer<typeof LoginSchema>

/** 不含密码哈希的用户视图。 */
export interface AuthUserDto {
  id: number
  email: string
  role: string
  createdAt: string
}

export interface AuthResponse {
  user: AuthUserDto
}
