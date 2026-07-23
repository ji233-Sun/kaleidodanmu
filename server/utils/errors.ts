/** 带 HTTP 状态码与错误码的业务异常，由 handleApiError 统一转换。 */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}
