/**
 * 服务层端到端自检：直接调用 service（不经 HTTP），覆盖 auth/effect/version/
 * draft/settings/token 全链路。用独立 DB 文件，不污染 dev 库。
 * 运行：DB_PATH=./data/smoke.db pnpm exec tsx scripts/smoke.ts
 */
import 'reflect-metadata'
import { initDataSource, closeDataSource } from '../server/database/data-source'
import { AuthService } from '../server/services/auth.service'
import { EffectService } from '../server/services/effect.service'
import { VersionService } from '../server/services/version.service'
import { DraftService } from '../server/services/draft.service'
import { SettingsService } from '../server/services/settings.service'
import { TokenService } from '../server/services/token.service'

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('  ✗ FAIL:', msg)
    process.exitCode = 1
  } else {
    console.log('  ✓', msg)
  }
}

async function main(): Promise<void> {
  await initDataSource()

  const email = `smoke_${Date.now()}@test.local`

  const { user, token } = await AuthService.register(email, 'password123')
  assert(user.id > 0, 'register 创建用户')
  assert(typeof token === 'string' && token.length > 0, 'register 颁发 session token')

  const login = await AuthService.login(email, 'password123')
  assert(login.user.id === user.id, 'login 校验通过')

  const effect = await EffectService.create({ ownerId: user.id, slug: 'smoke-fx', name: 'Smoke' })
  assert(effect.slug === 'smoke-fx', 'create effect')
  assert((await EffectService.get(effect.id, user.id)).id === effect.id, 'get effect')

  const code = Buffer.from('export default { setup() { return { render() {} } } }').toString('base64')
  const version = await VersionService.create(effect.id, user.id, {
    version: '1.0.0',
    entry: 'main.js',
    sdkVersion: '0.1',
    schemaVersion: '1',
    manifestJson: '{}',
    code,
  })
  assert(version.sha256.length === 64, 'create version + 计算 sha256')
  assert(version.id > 0, 'version 落库')

  const published = await EffectService.publish(effect.id, user.id, version.id, 'published')
  assert(published.publishedVersionId === version.id, 'publish 指向 published')

  assert((await EffectService.list(user.id)).length === 1, 'list effects')

  const draft = await DraftService.save(effect.id, user.id, '{"x":1}')
  assert(draft.snapshotJson === '{"x":1}', 'save draft')
  assert((await DraftService.get(effect.id, user.id))?.id === draft.id, 'get draft')

  assert((await SettingsService.set('feature.foo', 'true')).value === 'true', 'set setting')

  const created = await TokenService.create(user.id, ['upload'])
  assert(created.token.startsWith('kdt_'), 'create token（明文仅返回一次）')
  assert((await TokenService.list(user.id)).length === 1, 'list tokens')

  await closeDataSource()
  console.log(process.exitCode ? '\n[smoke] FAILED' : '\n[smoke] ALL PASS')
}

main().catch((err) => {
  console.error('[smoke] ERROR', err)
  process.exit(1)
})
