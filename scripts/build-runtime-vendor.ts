/**
 * 预构建运行时 vendor 依赖：把锁定版本的 three / gsap / @kaleido/sdk 各自打包成自包含 ESM，
 * 输出到 public/kaleido-runtime/vendor/*.mjs。运行时（/effect-runtime）把 Effect 入口里的裸
 * import（"three" / "gsap" / "@kaleido/sdk"）重写为这些 vendor URL，从而用 blob + 原生 import()
 * 加载真 ESM，无需 import map，也不需要把依赖打进每个 Effect 包。
 *
 * 由 predev / prebuild 自动执行（见 package.json）。
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

const OUT_DIR = 'public/kaleido-runtime/vendor'

// key = 输出文件名（不含扩展名）；value = 该 vendor 模块要 re-export 的包/入口。
const ENTRIES: Record<string, string> = {
  three: "export * from 'three'",
  gsap: "export * from 'gsap'",
  'kaleido-sdk': "export * from '@kaleido/sdk'",
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  await Promise.all(
    Object.entries(ENTRIES).map(([name, contents]) =>
      build({
        stdin: { contents, resolveDir: process.cwd(), loader: 'ts' },
        bundle: true,
        format: 'esm',
        platform: 'browser',
        minify: true,
        legalComments: 'none',
        outfile: `${OUT_DIR}/${name}.mjs`,
      }),
    ),
  )
  console.log(`[vendor] 已生成 ${Object.keys(ENTRIES).map((n) => `${n}.mjs`).join(', ')} → ${OUT_DIR}`)
}

main().catch((err) => {
  console.error('[vendor] 构建失败', err)
  process.exit(1)
})
