import { EffectRepository } from '@/server/repositories/effect.repository'

/** 业务逻辑层：编排 repository，处理校验与领域错误。 */
export const EffectService = {
  async list() {
    return EffectRepository.findAll()
  },

  async create(input: { ownerId: number; slug: string; name: string }) {
    if (await EffectRepository.findBySlug(input.slug)) {
      throw new HttpError(409, 'slug_already_taken', 'Slug already taken')
    }
    return EffectRepository.create(input)
  },
}

/** 带 HTTP 状态码与错误码的业务异常。 */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
