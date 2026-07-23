// Kaleido CLI 入口。
// 由 tsup 编译为 dist/cli/index.js（CJS + shebang），经根 package.json 的 bin
// 注册为 `kaleido` 命令。
// 构建后用：node dist/cli/index.js --version，或 pnpm kaleido --version。

import { createCommand } from 'commander'
import pkg from '../package.json'

const program = createCommand()

program
  .name('kaleido')
  .description('Kaleido CLI — 本地开发与发布万花筒 Effect Package')
  .version(pkg.version)

program
  .command('ping')
  .description('连通性自检')
  .action(() => {
    console.log('pong')
  })

// 预留命令（后续阶段实现）：login / whoami / init / dev / build / validate / upload / publish

program.parseAsync(process.argv).catch((err) => {
  console.error(err)
  process.exit(1)
})
