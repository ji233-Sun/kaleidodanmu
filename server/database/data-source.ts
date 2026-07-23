import 'reflect-metadata' // TypeORM 装饰器元数据，必须最先导入
import 'better-sqlite3' // 副作用导入：向 TypeORM 注册 better-sqlite3 驱动
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DataSource } from 'typeorm'
import type { Logger } from 'typeorm'
import { env } from '@/lib/env'
import { User } from './entities/user.entity'
import { Session } from './entities/session.entity'
import { Effect } from './entities/effect.entity'
import { EffectVersion } from './entities/effectVersion.entity'
import { Draft } from './entities/draft.entity'
import { ApiToken } from './entities/apiToken.entity'
import { AppSetting } from './entities/appSetting.entity'

const dbPath = env.dbPath

// SQLite 不会自动创建父目录，初始化前确保存在
mkdirSync(dirname(dbPath), { recursive: true })

/** 屏蔽查询噪声，只保留 schema 同步 / error / warn。 */
class StartupLogger implements Logger {
  logQuery(): void {}
  logQueryError(error: string | Error, query: string): void {
    console.error(`[db] query error: ${error}\n  ${query}`)
  }
  logQuerySlow(): void {}
  logSchemaBuild(message: string): void {
    console.log(`[db] schema · ${message}`)
  }
  logMigration(): void {}
  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    if (level === 'warn') console.warn(`[db] ${message}`)
    else console.log(`[db] ${message}`)
  }
}

/** 全仓唯一的连接定义：better-sqlite3 + synchronize（原型期自动建表）。 */
export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: dbPath,
  entities: [User, Session, Effect, EffectVersion, Draft, ApiToken, AppSetting],
  synchronize: true, // 原型期自动同步 Schema；生产关闭并改用迁移
  logging: ['schema', 'error', 'warn'],
  logger: new StartupLogger(),
})

/** 幂等初始化：服务端启动（instrumentation）或独立脚本调用。 */
export async function initDataSource(): Promise<void> {
  if (AppDataSource.isInitialized) return
  await AppDataSource.initialize()
  console.log(`[db] ready · ${dbPath}`)
}

export async function closeDataSource(): Promise<void> {
  if (AppDataSource.isInitialized) await AppDataSource.destroy()
}
