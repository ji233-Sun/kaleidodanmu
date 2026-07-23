"use client";

import type { ApiErrorBody } from "@/types";

/** 后端统一错误体（types/common.ts ApiErrorBody）对应的客户端异常。 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiFetchInit extends Omit<RequestInit, "body"> {
  /** 传入对象时自动 JSON 序列化并补 Content-Type */
  json?: unknown;
}

/** 统一 API 请求封装：JSON 编解码，错误规整为 ApiError。 */
export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const { json, headers, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "unknown_error",
      err?.message ?? `请求失败（HTTP ${res.status}）`,
    );
  }
  return data as T;
}
