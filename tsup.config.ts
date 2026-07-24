import { defineConfig } from 'tsup'

// 把 cli/ 编译为 Node 可执行 CLI（CJS + shebang），输出到可发布包 packages/cli/dist。
// 构建成功后把 packages/template 复制进 packages/cli/template（供 kdanmu init 使用），
// 并把复制体的 package.json 改写为“已发布依赖 + kdanmu 脚本”，让外部 init 出来的工程可直接安装运行。
export default defineConfig({
  entry: { index: 'cli/index.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  outDir: 'packages/cli/dist',
  clean: true,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
  async onSuccess() {
    const { cpSync, rmSync, readFileSync, writeFileSync } = await import('node:fs')
    const { basename } = await import('node:path')
    const dest = 'packages/cli/template'
    const skip = new Set(['node_modules', 'dist', '.kdanmu.json'])
    rmSync(dest, { recursive: true, force: true })
    cpSync('packages/template', dest, { recursive: true, filter: (src) => !skip.has(basename(src)) })

    const pkgPath = `${dest}/package.json`
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      scripts?: Record<string, string>
    }
    pkg.scripts = { dev: 'kdanmu dev', build: 'kdanmu build', validate: 'kdanmu validate', upload: 'kdanmu upload' }
    pkg.dependencies = { ...(pkg.dependencies ?? {}), 'kdanmu-sdk': '^0.1.0' }
    pkg.devDependencies = {
      ...(pkg.devDependencies ?? {}),
      kdanmu: '^0.1.0',
      vite: pkg.devDependencies?.vite ?? '^8.1.5',
    }
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log(`[tsup] 模板已复制并改写为发布依赖 → ${dest}`)
  },
})
