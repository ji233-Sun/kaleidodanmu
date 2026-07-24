import { defineConfig } from "vite";

// Effect Package 构建：build.lib 产出单个 ES Module 入口（entry.mjs）。
// three / gsap / kdanmu-sdk 外置——产物里保留裸 import，由运行时重写为 vendor URL 加载，
// 因此不会把这些库打进每个效果包。
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "entry.mjs",
    },
    rollupOptions: {
      external: ["three", "gsap", "kdanmu-sdk"],
    },
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    minify: false,
  },
});
