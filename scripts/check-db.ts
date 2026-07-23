/**
 * 独立 DB 自检：初始化 DataSource（触发 synchronize 建表）并打印已建表。
 * 运行：pnpm exec tsx scripts/check-db.ts
 */
import 'reflect-metadata'
import { AppDataSource, initDataSource, closeDataSource } from '../server/database/data-source'

async function main(): Promise<void> {
  await initDataSource()
  const rows = (await AppDataSource.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
  )) as { name: string }[]
  const tables = rows.map((r) => r.name)
  const expected = [
    'api_tokens',
    'app_settings',
    'drafts',
    'effect_versions',
    'effects',
    'sessions',
    'users',
  ]
  const missing = expected.filter((t) => !tables.includes(t))
  console.log(`[check-db] tables (${tables.length}): ${tables.join(', ')}`)
  if (missing.length > 0) {
    console.error(`[check-db] MISSING: ${missing.join(', ')}`)
    process.exitCode = 1
  } else {
    console.log('[check-db] OK · all expected tables present')
  }
  await closeDataSource()
}

main().catch((err) => {
  console.error('[check-db] FAILED', err)
  process.exit(1)
})
