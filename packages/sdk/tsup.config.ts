import { defineConfig } from 'tsup'

// @kaleido/sdk 独立构建配置：产出 ESM + d.ts 到 dist（发布用）。
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  sourcemap: true,
})
