# 数据库与 ORM 约定

本文件规定 B 站万花筒弹幕原型的数据层实现细节，是[技术方案](./bilibili-kaleidoscope-danmaku-technical-plan.md) §3.1 的展开。技术栈：**TypeORM + better-sqlite3**，实体即 Schema，原型阶段用 `synchronize` 自动建表。所有数据库访问都在 Route Handlers / Server Actions 的服务端完成，浏览器侧不直接接触数据库。

目录约定（服务端代码统一放在根 `server/`，分三层）：

```text
server/
  database/
    data-source.ts      # TypeORM 连接配置（AppDataSource 单例）
    entities/           # Entity 定义（*.entity.ts）
  repositories/         # 数据访问封装（*.repository.ts）
  services/             # 业务逻辑（*.service.ts）
lib/
  env.ts                # 环境变量集中读取
```

分层规则：**Route Handler → Service → Repository → DataSource**。Route 与 Service 都不直接碰 `AppDataSource.getRepository`，所有表读写经 Repository 封装。

## 1. 选型与原则

| 维度 | 选择 | 说明 |
| --- | --- | --- |
| ORM | TypeORM（`DataSource` API + 装饰器实体） | 现代单例 API；实体即 Schema，便于跨表推理 |
| 驱动 | better-sqlite3 | 同步原生驱动，零外部服务、单文件；`type: 'better-sqlite3'` |
| 建表 | `synchronize: true` | 原型期改实体即落库，零迁移脚本；生产关闭 |
| 迁移 | 暂不使用 | 生产演进时再引入 TypeORM CLI 迁移 |
| 访问入口 | `getRepo<T>('表名')`（懒初始化 + 按表名查元数据） | 统一入口，不散落连接；不按实体类取 Repository（跨上下文/类名压缩会查不到元数据） |

原则：原型零外部依赖、零运维；业务代码与驱动解耦，切 PostgreSQL 基本只换 `type` + 迁移。

## 2. 连接：DataSource 单例

`server/database/data-source.ts` 是全仓唯一的连接定义；数据库路径从 `lib/env.ts` 读取，不直接读 `process.env`：

> ⚠️ **Turbopack 多上下文陷阱（2026-07-23 修复）**：Next.js（Turbopack）下 instrumentation 与 Route Handler 各自加载一份模块（生产构建甚至可能不同线程），模块级单例 + 启动钩子初始化**不可靠**——曾导致全部 HTTP 接口 500（`EntityMetadataNotFoundError`）。因此现在遵守两条规则：
>
> 1. Repository 一律经 `getRepo<T>('table_name')` 获取，**首次调用时懒初始化本上下文的连接**（`initDataSource` 幂等），不依赖 instrumentation 的初始化时序。
> 2. `getRepo` 按**表名字符串**取 Repository（`'users'`、`'sessions'` 等），不按实体类——跨上下文实体类不是同一引用，且生产构建会压缩类名，都会导致元数据查找失败。

```ts
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

const dbPath = env.dbPath

// SQLite 不会自动创建父目录，初始化前确保存在
mkdirSync(dirname(dbPath), { recursive: true })

class StartupLogger implements Logger {
  logQuery(): void {}
  logQueryError(error: string | Error, query: string): void {
    console.error(`[db] query error: ${error}\n  ${query}`)
  }
  logQuerySlow(): void {}
  logSchemaBuild(message: string): void { console.log(`[db] schema · ${message}`) }
  logMigration(): void {}
  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    if (level === 'warn') console.warn(`[db] ${message}`)
    else console.log(`[db] ${message}`)
  }
}

function createDataSource(): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database: dbPath,
    entities: [User, Session, Effect, EffectVersion, Draft, ApiToken, AppSetting],
    synchronize: true, // 原型期自动同步 Schema；生产关闭并改用迁移
    logging: ['schema', 'error', 'warn'],
    logger: new StartupLogger(),
  })
}

// globalThis 单例只在同一模块上下文内生效（见上方警告）
const globalForDs = globalThis as unknown as { __kaleidoDataSource?: DataSource }

export const AppDataSource = (globalForDs.__kaleidoDataSource ??= createDataSource())

/** 幂等初始化：服务端启动（instrumentation）、Repository 首访或独立脚本调用。 */
export async function initDataSource(): Promise<void> {
  if (AppDataSource.isInitialized) return
  await AppDataSource.initialize()
  console.log(`[db] ready · ${dbPath}`)
}

/** 取实体 Repository（按表名字符串）；首次调用时按需初始化本上下文的连接。 */
export async function getRepo<T extends ObjectLiteral>(entityName: string): Promise<Repository<T>> {
  await initDataSource()
  return AppDataSource.getRepository(entityName) as Repository<T>
}

export async function closeDataSource(): Promise<void> {
  if (AppDataSource.isInitialized) await AppDataSource.destroy()
}
```

要点：

- `reflect-metadata` 必须最先导入，否则装饰器元数据缺失、列类型推断失效。
- `import 'better-sqlite3'` 是副作用导入，让 `type: 'better-sqlite3'` 能解析到驱动。
- 自定义 `StartupLogger` 屏蔽查询噪声，只打印 schema 同步 / error / warn。
- `initDataSource()` 用 `isInitialized` 守卫，幂等。
- **Repository 层不直接引用 `AppDataSource.getRepository`，一律用 `getRepo<T>('表名')`**，保证任何模块上下文下首次访问前连接已初始化。

## 3. 启动初始化（instrumentation.ts）

Next.js 的 `instrumentation.ts` 在服务端进程启动时执行一次，等价于服务端启动钩子。`better-sqlite3` 只能在 Node 运行时加载，必须用 `NEXT_RUNTIME` 守卫排除 Edge，否则打包到 Edge 会报错：

```ts
// instrumentation.ts
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initDataSource } = await import('@/server/database/data-source')
    await initDataSource()
  }
}
```

## 4. 配置项

- `tsconfig.json` 开启装饰器元数据（TypeORM 依赖 `emitDecoratorMetadata` 推断列类型，否则 `@Column` 类型推断失效）：

  ```jsonc
  { "compilerOptions": { "experimentalDecorators": true, "emitDecoratorMetadata": true } }
  ```

- `next.config.ts` 把原生模块排除出打包，避免被打进客户端/Edge 产物：

  ```ts
  const nextConfig: NextConfig = {
    serverExternalPackages: ["better-sqlite3"],
  }
  ```

- 环境变量集中在 `lib/env.ts` 读取：`DB_PATH`（默认 `./data/app.db`）、`SESSION_SECRET` 等；`data/` 加入 `.gitignore`。**不使用 `DATABASE_URL`**。

## 5. 实体约定

所有实体（`server/database/entities/*.entity.ts`）遵守同一套约定：

- **命名**：表名/列名一律 `snake_case`（`@Entity({ name })` / `@Column({ name })`），TS 属性 `camelCase`。
- **约束显式命名**：主键、唯一、索引都给名字——`pk_*` / `uq_*` / `idx_*`。保证 `synchronize` 多次重启 diff 稳定，也方便裸 SQL（如 `ON CONFLICT(...)`）引用。
- **外键不用关系装饰器**：外键写成普通 `integer` 列，**不写 `@ManyToOne` / `@OneToMany`**。跨表查询用 `createQueryBuilder` 或裸 SQL 手动 join，规避关系装配在 better-sqlite3 上的坑。
- **时间戳**：`datetime` 默认 `() => 'CURRENT_TIMESTAMP'`。
- **主键**：自增实体用 `@PrimaryGeneratedColumn('increment', { type: 'integer', primaryKeyConstraintName })`；token/键值类用 `@PrimaryColumn`。

## 6. 实体清单

| 表 | 实体 | 主键 | 关键列 |
| --- | --- | --- | --- |
| `users` | `User` | `id`（自增） | `email`（唯一）、`password_hash`、`role`、`created_at` |
| `sessions` | `Session` | `id`（text token） | `user_id`、`expires_at`、`created_at` |
| `effects` | `Effect` | `id`（自增） | `owner_id`、`slug`（唯一）、`name`、`draft/staging/published_version_id`、`created_at`、`updated_at` |
| `effect_versions` | `EffectVersion` | `id`（自增） | `effect_id`、`version`（联合唯一）、`sha256`、`entry`、`size_bytes`、`sdk_version`、`schema_version`、`manifest_json`、`storage_key`、`created_by`、`created_at` |
| `drafts` | `Draft` | `id`（自增） | `effect_id`（可空）、`owner_id`、`snapshot_json`、`updated_at` |
| `api_tokens` | `ApiToken` | `id`（自增） | `user_id`、`token_hash`（唯一）、`scopes`、`expires_at`（可空）、`revoked_at`（可空）、`created_at` |
| `app_settings` | `AppSetting` | `key`（text） | `value`（JSON 字符串，默认 `'{}'`） |

版本语义：`EffectVersion` 本身不可覆盖，`Effect` 上的 `draft/staging/published_version_id` 三个指针负责发布与回滚——切换/回滚只改这三个外键。

## 7. 实体定义示例

```ts
// server/database/entities/user.entity.ts
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'users' })
@Index('uq_users_email', ['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('increment', { type: 'integer', primaryKeyConstraintName: 'pk_users' })
  id!: number

  @Column({ type: 'text', nullable: false })
  email!: string

  @Column({ name: 'password_hash', type: 'text', nullable: false })
  passwordHash!: string

  @Column({ type: 'text', default: 'creator' })
  role!: string

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date
}
```

```ts
// server/database/entities/session.entity.ts
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity({ name: 'sessions' })
@Index('idx_sessions_user', ['userId'])
export class Session {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'pk_sessions' })
  id!: string // 随机 token，即主键

  @Column({ name: 'user_id', type: 'integer', nullable: false })
  userId!: number

  @Column({ name: 'expires_at', type: 'datetime', nullable: false })
  expiresAt!: Date

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date
}
```

```ts
// server/database/entities/effect.entity.ts —— 草稿/暂存/发布三指针
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'effects' })
@Index('uq_effects_slug', ['slug'], { unique: true })
@Index('idx_effects_owner', ['ownerId'])
export class Effect {
  @PrimaryGeneratedColumn('increment', { type: 'integer', primaryKeyConstraintName: 'pk_effects' })
  id!: number

  @Column({ name: 'owner_id', type: 'integer', nullable: false })
  ownerId!: number

  @Column({ type: 'text', nullable: false })
  slug!: string

  @Column({ type: 'text', nullable: false })
  name!: string

  // 版本本身不可覆盖，发布/回滚只改这三个外键指针
  @Column({ name: 'draft_version_id', type: 'integer', nullable: true })
  draftVersionId!: number | null

  @Column({ name: 'staging_version_id', type: 'integer', nullable: true })
  stagingVersionId!: number | null

  @Column({ name: 'published_version_id', type: 'integer', nullable: true })
  publishedVersionId!: number | null

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date
}
```

```ts
// server/database/entities/effectVersion.entity.ts —— 不可变版本记录
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'effect_versions' })
@Index('idx_effect_versions_effect', ['effectId'])
@Index('uq_effect_versions_effect_version', ['effectId', 'version'], { unique: true })
export class EffectVersion {
  @PrimaryGeneratedColumn('increment', { type: 'integer', primaryKeyConstraintName: 'pk_effect_versions' })
  id!: number

  @Column({ name: 'effect_id', type: 'integer', nullable: false })
  effectId!: number

  @Column({ type: 'text', nullable: false })
  version!: string // 语义化版本号，同一 effect 下唯一

  @Column({ name: 'sha256', type: 'text', nullable: false })
  sha256!: string

  @Column({ type: 'text', nullable: false })
  entry!: string // 入口模块，如 main.mjs

  @Column({ name: 'size_bytes', type: 'integer', nullable: false })
  sizeBytes!: number

  @Column({ name: 'sdk_version', type: 'text', nullable: false })
  sdkVersion!: string

  @Column({ name: 'schema_version', type: 'text', nullable: false })
  schemaVersion!: string

  @Column({ name: 'manifest_json', type: 'text', nullable: false })
  manifestJson!: string // 完整 effect.json 快照

  @Column({ name: 'storage_key', type: 'text', nullable: false })
  storageKey!: string // 指向本地 ArtifactStore / 对象存储中的产物

  @Column({ name: 'created_by', type: 'integer', nullable: false })
  createdBy!: number

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date
}
```

```ts
// server/database/entities/appSetting.entity.ts —— 通用 key/value 配置
import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity({ name: 'app_settings' })
export class AppSetting {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'pk_app_settings' })
  key!: string

  @Column({ type: 'text', default: '{}' })
  value!: string // JSON 字符串
}
```

`drafts` 与 `api_tokens` 沿用同一约定：

- `drafts`：网页 ADE 浏览器虚拟文件系统的服务端持久化快照——`effect_id`（可空）、`owner_id`、`snapshot_json`、`updated_at`。
- `api_tokens`：CLI 经 PKCE / Device Code 换发的访问令牌——`user_id`、`token_hash`（唯一）、`scopes`、`expires_at`（可空）、`revoked_at`（可空）；**只存哈希不存明文**。

## 8. 分层访问：Repository / Service / Route

数据访问分三层，自下而上：`DataSource` → `Repository` → `Service` → `Route Handler`。上层不跨层调用，避免业务逻辑散落到路由里。请求/响应的 Zod schema 与 DTO 放在 `types/`（如 `CreateEffectSchema` / `EffectDto`），service、route、前端共用一份。

**Repository**（`server/repositories/*.repository.ts`）——封装单表的读写，唯一允许接触 DataSource 的地方，一律经 `getRepo` 按表名取 Repository：

```ts
// server/repositories/effect.repository.ts
import { getRepo } from '@/server/database/data-source'
import type { Effect } from '@/server/database/entities/effect.entity'

// 懒初始化连接并按表名取 Repository（见 data-source.ts 注释）
const repo = () => getRepo<Effect>('effects')

export const EffectRepository = {
  findAllByOwner: async (ownerId: number) =>
    (await repo()).find({ where: { ownerId }, order: { createdAt: 'DESC' } }),
  findByIdOwned: async (id: number, ownerId: number) => (await repo()).findOneBy({ id, ownerId }),
  findBySlug: async (slug: string) => (await repo()).findOneBy({ slug }),
  create: async (data: Pick<Effect, 'ownerId' | 'slug' | 'name'>) =>
    (await repo()).save((await repo()).create(data)),
}
```

**Service**（`server/services/*.service.ts`）——业务逻辑：编排 Repository、做校验和跨表操作、抛领域错误：

```ts
// server/services/effect.service.ts
import { HttpError } from '@/server/utils/errors'
import { EffectRepository } from '@/server/repositories/effect.repository'
import type { EffectDto, CreateEffectRequest } from '@/types'
import type { Effect } from '@/server/database/entities/effect.entity'

function toEffectDto(e: Effect): EffectDto {
  // 实体 → DTO（如 createdAt: e.createdAt.toISOString()）
  return { /* ...映射各字段... */ } as EffectDto
}

export const EffectService = {
  async list(ownerId: number) {
    return (await EffectRepository.findAllByOwner(ownerId)).map(toEffectDto)
  },
  async create(input: CreateEffectRequest & { ownerId: number }) {
    if (await EffectRepository.findBySlug(input.slug)) {
      throw new HttpError(409, 'slug_already_taken', 'Slug already taken')
    }
    return toEffectDto(await EffectRepository.create(input))
  },
}
```

**Route Handler**——只做 HTTP 编排：鉴权（`requireUser`）、用 `types/` 的 schema 校验入参、调 Service、`handleApiError` 兜底：

```ts
// app/api/effects/route.ts
import { NextResponse } from 'next/server'
import { requireUser, handleApiError } from '@/server/utils/http'
import { EffectService } from '@/server/services/effect.service'
import { CreateEffectSchema } from '@/types'

export async function POST(req: Request) {
  try {
    const user = await requireUser(req)
    const body = CreateEffectSchema.parse(await req.json())
    const effect = await EffectService.create({ ownerId: user.id, ...body })
    return NextResponse.json({ effect }, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
```

聚合走 `createQueryBuilder`，需要 SQLite 原生 upsert 时用裸 SQL（`ON CONFLICT ... DO UPDATE`）；这两种查询同样封装在 Repository 内，不外泄到 Service / Route。

## 9. 原型期约定与生产演进

**原型期约定**：

- 不写迁移：仅用 `synchronize: true` 自动建表，不配置 migrations 目录或脚本。
- 不启用 TypeORM 关系装饰器（外键用普通 `integer` 列）。
- 不开事务（需要原子操作时再单独引入 `AppDataSource.transaction`）。
- 改字段就改实体再重启，由 `synchronize` 落库。

**生产演进**：

- 把 DataSource 的 `type` 换成 `'postgres'`、关闭 `synchronize`。
- 用 TypeORM CLI 生成并运行正式迁移（`migration:generate` / `migration:run`，届时再建 `migrations/` 目录）。
- 业务层 Repository / Service 调用基本不变。
