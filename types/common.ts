/** 统一错误响应体。 */
export interface ApiErrorBody {
  error: { code: string; message: string }
}

/** 分页列表。 */
export interface Paginated<T> {
  items: T[]
  total: number
}
