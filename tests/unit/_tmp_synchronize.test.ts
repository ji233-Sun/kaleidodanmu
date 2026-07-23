import { describe, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { DataSource } from 'typeorm'

describe('exact-data-source', () => {
  let dir: string
  let ds: DataSource
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'iso-'))
    process.env.DB_PATH = join(dir, 'test.db')
    process.env.SESSION_SECRET = 'test'
    // Simulate: import data-source which evaluates AppDataSource
    const dsMod = await import('@/server/database/data-source')
    await dsMod.initDataSource()
    ds = dsMod.AppDataSource
  })
  afterAll(async () => {
    const dsMod = await import('@/server/database/data-source')
    await dsMod.closeDataSource()
    rmSync(dir, { recursive: true, force: true })
  })

  it('check', async () => {
    const dbPath = process.env.DB_PATH!
    const database = new Database(dbPath, { readonly: true })
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
    database.close()
    console.log('tables:', tables.map((table) => table.name))
    console.log('initialized?', ds.isInitialized)
    console.log('entity metadatas count:', ds.entityMetadatas.length)
    console.log('entity names:', ds.entityMetadatas.map((metadata) => metadata.tableName))
  })
})
