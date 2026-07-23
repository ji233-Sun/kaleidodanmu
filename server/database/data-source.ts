import 'reflect-metadata' // TypeORM 装饰器元数据，必须最先导入
import 'better-sqlite3' // 副作用导入：向 TypeORM 注册 better-sqlite3 驱动
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DataSource } from 'typeorm'
import type { Logger, ObjectLiteral, Repository } from 'typeorm'
import { env } from '@/lib/env'
import { User } from './entities/user.entity'
import { Session } from './entities/session.entity'
import { Effect } from './entities/effect.entity'
import { EffectVersion } from './entities/effectVersion.entity'
import { Draft } from './entities/draft.entity'
import { ApiToken } from './entities/apiToken.entity'
import { AppSetting } from './entities/appSetting.entity'
import { EffectInteraction } from './entities/effectInteraction.entity'

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
function createDataSource(): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database: dbPath,
    entities: [
      User,
      Session,
      Effect,
      EffectVersion,
      EffectInteraction,
      Draft,
      ApiToken,
      AppSetting,
    ],
    synchronize: true, // 原型期自动同步 Schema；生产关闭并改用迁移
    logging: ['schema', 'error', 'warn'],
    logger: new StartupLogger(),
  })
}

// Next.js（Turbopack）下 instrumentation 与 Route Handler 各自加载一份模块（甚至不同线程），
// globalThis 单例只能在同一上下文内生效。因此连接按「本模块上下文一份」管理，
// 由 Repository 层在首次使用时经 getRepo() 懒初始化，不能依赖启动钩子完成初始化。
const globalForDs = globalThis as unknown as { __kaleidoDataSource?: DataSource }

export const AppDataSource = (globalForDs.__kaleidoDataSource ??= createDataSource())

/** 幂等初始化：服务端启动（instrumentation）、Repository 首访或独立脚本调用。 */
export async function initDataSource(): Promise<void> {
  if (AppDataSource.isInitialized) return
  await AppDataSource.initialize()
  console.log(`[db] ready · ${dbPath}`)
}

/**
 * 取实体 Repository（按表名字符串：表名是字符串字面量，不受跨上下文类引用不一致和生产构建类名压缩影响）；
 * 首次调用时按需初始化本上下文的连接。
 */
export async function getRepo<T extends ObjectLiteral>(entityName: string): Promise<Repository<T>> {
  await initDataSource()
  return AppDataSource.getRepository(entityName) as Repository<T>
}

export async function closeDataSource(): Promise<void> {
  if (AppDataSource.isInitialized) await AppDataSource.destroy()
}
