// kdanmu CLI 共享配置：凭证读写与后端地址解析。
// 凭证由 `kdanmu login` 写入 ~/.kdanmu/credentials.json（chmod 600）。

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// 正式（默认）后端域名。发布到 npm 的 CLI 默认指向这里；
// 本地测试用环境变量 KDANMU_BASE_URL=http://localhost:3000 覆盖，或用 --base-url。
export const DEFAULT_BASE_URL = 'https://kdanmu.hnrobert.space'

export interface Credentials {
  baseUrl: string
  token: string
  expiresAt: string | null
  scopes: string[]
}

export function credentialsPath(): string {
  return join(homedir(), '.kdanmu', 'credentials.json')
}

/**
 * 解析后端地址，优先级：显式 --base-url > 环境变量 KDANMU_BASE_URL > 默认正式域名。
 * 末尾斜杠会被去掉。
 */
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
