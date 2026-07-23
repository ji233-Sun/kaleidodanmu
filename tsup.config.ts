import { defineConfig } from 'tsup'

// 把 lib/cli 编译为 Node 可执行的 CLI：CJS、注入 shebang、输出到 dist/cli。
export default defineConfig({
  entry: ['cli/index.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist/cli',
  clean: true,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
})
