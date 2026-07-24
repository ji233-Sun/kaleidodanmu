// kdanmu CLI 入口。
// 由 tsup 编译为 dist/cli/index.js（CJS + shebang），经根 package.json 的 bin
// 注册为 `kdanmu` 命令。
// 构建后用：node dist/cli/index.js --version，或 pnpm kdanmu --version。

import { createCommand } from 'commander'
import pkg from '../package.json'
import { login, whoami } from './auth'

const program = createCommand()

program
  .name('kdanmu')
  .description('kdanmu CLI — 本地开发与发布 Canvas Effect Package')
  .version(pkg.version)

program
  .command('ping')
  .description('连通性自检')
  .action(() => {
    console.log('pong')
  })

program
  .command('login')
  .description('浏览器 OAuth 授权登录（本地回调）')
  .option('--base-url <url>', '后端地址（默认 http://localhost:3000，也可用 KDANMU_BASE_URL）')
  .option('--no-open', '不自动打开浏览器，只打印授权链接')
  .action(async (opts: { baseUrl?: string; open?: boolean }) => {
    await login({ baseUrl: opts.baseUrl, open: opts.open })
  })

program
  .command('whoami')
  .description('查看当前登录用户')
  .action(async () => {
    await whoami()
  })

// 预留命令（后续阶段实现）：init / dev / build / validate / upload / publish

program.parseAsync(process.argv).catch((err) => {
  console.error(err)
  process.exit(1)
})
