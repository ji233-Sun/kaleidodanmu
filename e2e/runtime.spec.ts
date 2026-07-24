import { test, expect } from '@playwright/test'

// 与运行时约定一致的最小 Effect：使用 three / gsap / @kaleido/sdk（裸 import），
// 运行时会把它们重写为同源 vendor URL 后以 blob + 原生 import() 加载。
const SAMPLE_EFFECT = `import * as THREE from "three";
import { gsap } from "gsap";
import { defineEffect } from "@kaleido/sdk";
export default defineEffect({
  setup({ canvas }) {
    const scene = new THREE.Scene();
    const ctx = canvas.getContext("2d");
    gsap.to({ x: 0 }, { x: 1, duration: 0.3 });
    return {
      onDanmaku() {},
      render() { if (ctx) { ctx.fillStyle = "#3fa9f5"; ctx.fillRect(0, 0, 40, 40); } void scene; },
      resize() {},
      dispose() {},
    };
  },
});`

test('effect-runtime 用 blob + vendor 加载真 ESM 并渲染', async ({ page }) => {
  await page.goto('/effect-runtime')
  const result = await page.evaluate(async (source) => {
    const events: Array<{ type: string; value?: number }> = []
    const ch = new MessageChannel()
    ch.port1.onmessage = (e) => events.push(e.data)
    ch.port1.start()
    window.postMessage({ type: 'kaleido:connect' }, '*', [ch.port2])
    await new Promise((r) => setTimeout(r, 400))
    ch.port1.postMessage({
      type: 'load',
      source,
      recipe: { symmetry: 6, rotationSpeed: 0, motion: 'flow', palette: ['#081229', '#8dd8ff'], shardScale: 1, trail: 0.2, density: 1 },
      playing: true,
    })
    await new Promise((r) => setTimeout(r, 1200))
    return {
      ready: events.some((e) => e.type === 'ready'),
      gotFps: events.some((e) => e.type === 'fps'),
      hadError: events.some((e) => e.type === 'error'),
    }
  }, SAMPLE_EFFECT)

  expect(result.hadError).toBe(false)
  expect(result.ready).toBe(true)
  expect(result.gotFps).toBe(true)
})

test('effect-runtime 阻断网络（fetch 被禁用）', async ({ page }) => {
  await page.goto('/effect-runtime')
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('/api/auth/me')
      return 'not-blocked'
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  })
  expect(blocked).toContain('禁止')
})
