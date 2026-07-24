import { defineConfig, devices } from '@playwright/test'

// E2E 依赖一个已运行的开发服务器（pnpm dev，默认 :3000）。
// 生产构建目前受上游 Next 预渲染 bug 阻塞，故不自动 next build/start。
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['line']],
  timeout: 30_000,
  use: {
    baseURL: process.env.KDANMU_BASE_URL ?? 'http://localhost:3000',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
