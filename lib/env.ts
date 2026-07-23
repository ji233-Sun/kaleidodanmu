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
  /** LLM 代理上游（OpenAI 兼容）；LLM_API_KEY 为空表示代理未启用 */
  llmBaseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  llmApiKey: process.env.LLM_API_KEY || '',
  llmModel: process.env.LLM_MODEL || 'gpt-4o-mini',
} as const

export type Env = typeof env
