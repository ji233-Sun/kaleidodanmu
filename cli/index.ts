// kdanmu CLI 入口。
// 由 tsup 编译为 dist/cli/index.js（CJS + shebang），经根 package.json 的 bin
// 注册为 `kdanmu` 命令。
// 构建后用：node dist/cli/index.js --version，或 pnpm kdanmu --version。

import { createCommand } from 'commander'
import pkg from '../package.json'
import { login, whoami } from './auth'
import { buildCmd, devCmd, initCmd, publishCmd, uploadCmd, validateCmd } from './commands'

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
  .option('--base-url <url>', '后端地址（默认正式域名，本地测试用 KDANMU_BASE_URL=http://localhost:3000 覆盖）')
  .option('--no-open', '不自动打开浏览器，只打印授权链接')
  .action(async (opts: { baseUrl?: string; open?: boolean }) => {
    await login({ baseUrl: opts.baseUrl, open: opts.open })
  })

program
  .command('whoami')
  .description('查看当前登录用户')
  .option('--json', '以 JSON 输出结果')
  .action(async (opts: { json?: boolean }) => {
    await whoami(opts)
  })

program
  .command('init <name>')
  .description('从内置模板创建 Effect 工程')
  .option('--json', '以 JSON 输出结果')
  .option('--cwd <dir>', '在指定目录下创建（默认当前目录）')
  .action((name: string, opts: { json?: boolean; cwd?: string }) => initCmd(name, opts))

program
  .command('dev')
  .description('启动本地 Vite 开发预览（HMR）')
  .option('--cwd <dir>', 'Effect 工程目录（默认当前目录）')
  .action((opts: { cwd?: string }) => devCmd(opts))

program
  .command('build')
  .description('用 Vite 打包为单入口 ESM，并收集资源、校验产物')
  .option('--json', '以 JSON 输出结果')
  .option('--cwd <dir>', 'Effect 工程目录（默认当前目录）')
  .action((opts: { json?: boolean; cwd?: string }) => buildCmd(opts))

program
  .command('validate')
  .description('校验产物：裸依赖白名单、禁用 API、体积限额与 Manifest')
  .option('--json', '以 JSON 输出结果')
  .option('--cwd <dir>', 'Effect 工程目录（默认当前目录）')
  .action((opts: { json?: boolean; cwd?: string }) => validateCmd(opts))

program
  .command('upload')
  .description('上传为版本（默认 draft 渠道）；未关联云端时按 slug 解析或创建 Effect')
  .option('--json', '以 JSON 输出结果')
  .option('--cwd <dir>', 'Effect 工程目录（默认当前目录）')
  .option('--base-url <url>', '后端地址（默认取登录时保存的地址）')
  .option('--channel <channel>', '上传后设置的渠道：draft | staging | published', 'draft')
  .action((opts: { json?: boolean; cwd?: string; baseUrl?: string; channel?: 'draft' | 'staging' | 'published' }) =>
    uploadCmd(opts),
  )

program
  .command('publish')
  .description('将某版本发布到指定渠道；published 需 --yes 显式确认')
  .requiredOption('--channel <channel>', '渠道：draft | staging | published')
  .option('--version <semver>', '指定版本号（默认最新版本）')
  .option('--yes', '确认发布到 published（公开）')
  .option('--json', '以 JSON 输出结果')
  .option('--cwd <dir>', 'Effect 工程目录（默认当前目录）')
  .option('--base-url <url>', '后端地址（默认取登录时保存的地址）')
  .action(
    (opts: {
      channel: 'draft' | 'staging' | 'published'
      version?: string
      yes?: boolean
      json?: boolean
      cwd?: string
      baseUrl?: string
    }) => publishCmd(opts),
  )

program.parseAsync(process.argv).catch((err) => {
  console.error(err)
  process.exit(1)
})
