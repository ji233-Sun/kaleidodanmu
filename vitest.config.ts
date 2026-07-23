import { defineConfig } from 'vitest/config'

export default defineConfig({
  // 与 app 的 @/* 路径别名一致，便于测试直接 import 业务模块
  resolve: { alias: { '@': process.cwd() } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // 每个测试文件独立子进程：data-source 单例与 DB_PATH 互不污染
    pool: 'forks',
  },
})
