import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * 为单个测试文件启动一套独立后端：临时 SQLite 文件 + 全新 data-source 单例。
 * 必须在 import 业务模块前设置 DB_PATH，故用动态 import。
 * 每个测试文件在自己的 fork 子进程里运行，互不污染。
 */
export async function useBackend() {
  const dir = mkdtempSync(join(tmpdir(), 'kdanmu-test-'))
  process.env.DB_PATH = join(dir, 'test.db')

  const db = await import('@/server/database/data-source')
  await db.initDataSource()

  const [
    auth,
    effect,
    version,
    draft,
    settings,
    token,
    llmConfig,
    userRepo,
    sessionRepo,
    effectRepo,
    versionRepo,
    draftRepo,
    settingRepo,
    tokenRepo,
    adeSessionRepo,
    llmConfigRepo,
    cryptoMod,
    httpMod,
    jwtMod,
  ] = await Promise.all([
    import('@/server/services/auth.service'),
    import('@/server/services/effect.service'),
    import('@/server/services/version.service'),
    import('@/server/services/draft.service'),
    import('@/server/services/settings.service'),
    import('@/server/services/token.service'),
    import('@/server/services/llmConfig.service'),
    import('@/server/repositories/user.repository'),
    import('@/server/repositories/session.repository'),
    import('@/server/repositories/effect.repository'),
    import('@/server/repositories/effectVersion.repository'),
    import('@/server/repositories/draft.repository'),
    import('@/server/repositories/appSetting.repository'),
    import('@/server/repositories/apiToken.repository'),
    import('@/server/repositories/adeSession.repository'),
    import('@/server/repositories/llmConfig.repository'),
    import('@/server/utils/crypto'),
    import('@/server/utils/http'),
    import('@/server/utils/jwt'),
  ])

  const cleanup = async () => {
    await db.closeDataSource()
    rmSync(dir, { recursive: true, force: true })
  }

  return {
    cleanup,
    AppDataSource: db.AppDataSource,
    AuthService: auth.AuthService,
    EffectService: effect.EffectService,
    VersionService: version.VersionService,
    DraftService: draft.DraftService,
    SettingsService: settings.SettingsService,
    TokenService: token.TokenService,
    LlmConfigService: llmConfig.LlmConfigService,
    toAuthUser: auth.toAuthUser,
    toEffectDto: effect.toEffectDto,
    toVersionDto: version.toVersionDto,
    toDraftDto: draft.toDraftDto,
    UserRepository: userRepo.UserRepository,
    SessionRepository: sessionRepo.SessionRepository,
    EffectRepository: effectRepo.EffectRepository,
    EffectVersionRepository: versionRepo.EffectVersionRepository,
    DraftRepository: draftRepo.DraftRepository,
    AppSettingRepository: settingRepo.AppSettingRepository,
    ApiTokenRepository: tokenRepo.ApiTokenRepository,
    AdeSessionRepository: adeSessionRepo.AdeSessionRepository,
    LlmConfigRepository: llmConfigRepo.LlmConfigRepository,
    hashPassword: cryptoMod.hashPassword,
    verifyPassword: cryptoMod.verifyPassword,
    randomToken: cryptoMod.randomToken,
    encryptSecret: cryptoMod.encryptSecret,
    decryptSecret: cryptoMod.decryptSecret,
    requireUser: httpMod.requireUser,
    handleApiError: httpMod.handleApiError,
    apiError: httpMod.apiError,
    readCookie: httpMod.readCookie,
    setSessionCookie: httpMod.setSessionCookie,
    clearSessionCookie: httpMod.clearSessionCookie,
    SESSION_COOKIE: httpMod.SESSION_COOKIE,
    HttpError: httpMod.HttpError,
    signSessionToken: jwtMod.signSessionToken,
    verifySessionToken: jwtMod.verifySessionToken,
  }
}

export type Backend = Awaited<ReturnType<typeof useBackend>>

/** 生成唯一标识，避免同一文件内用例间的数据碰撞。 */
export function uniq(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}
