// kdanmu CLI 共享配置：凭证读写与后端地址解析。
// 凭证由 `kdanmu login` 写入 ~/.kdanmu/credentials.json（chmod 600）。

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const DEFAULT_BASE_URL = 'http://localhost:3000'

export interface Credentials {
  baseUrl: string
  token: string
  expiresAt: string | null
  scopes: string[]
}

export function credentialsPath(): string {
  return join(homedir(), '.kdanmu', 'credentials.json')
}

/** 解析后端地址：显式参数 > KDANMU_BASE_URL 环境变量 > 默认 localhost:3000。 */
export function resolveBaseUrl(opt?: string): string {
  return (opt ?? process.env.KDANMU_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
}

export function saveCredentials(creds: Credentials): void {
  const path = credentialsPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(creds, null, 2))
  chmodSync(path, 0o600)
}

export function loadCredentials(): Credentials | null {
  try {
    return JSON.parse(readFileSync(credentialsPath(), 'utf8')) as Credentials
  } catch {
    return null
  }
}
