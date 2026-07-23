/**
 * 集中读取环境变量。所有模块从这里取配置，不直接读 process.env。
 */
export const env = {
  /** SQLite 文件路径，默认 ./data/app.db */
  dbPath: process.env.DB_PATH || './data/app.db',
  /** 会话 / JWT 签名密钥 */
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  /** 运行环境 */
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const

export type Env = typeof env
