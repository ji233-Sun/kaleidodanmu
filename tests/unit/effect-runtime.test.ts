import { describe, it, expect } from 'vitest'
import { validateEffectSource, rewriteEffectImports, ALLOWED_SPECIFIERS } from '@/lib/runtime/effect'
import { LIMITS } from '@/types/manifest'

const VENDOR = {
  three: '/kaleido-runtime/vendor/three.mjs',
  gsap: '/kaleido-runtime/vendor/gsap.mjs',
  'kdanmu-sdk': '/kaleido-runtime/vendor/kaleido-sdk.mjs',
}

const okEntry = `import * as THREE from "three";
import { gsap } from "gsap";
import { defineEffect } from "kdanmu-sdk";
export default defineEffect({ setup() { return { render() {}, resize() {}, dispose() {} }; } });`

describe('validateEffectSource（ESM 安全校验）', () => {
  it('白名单说明符全部通过', () => {
    expect(ALLOWED_SPECIFIERS).toContain('three')
    expect(() => validateEffectSource(okEntry)).not.toThrow()
  })

  it('拒绝空入口', () => {
    expect(() => validateEffectSource('   ')).toThrow('不能为空')
  })

  it('拒绝非白名单裸依赖', () => {
    expect(() => validateEffectSource(`import x from "lodash";\n${okEntry}`)).toThrow('只能导入')
  })

  it('拒绝相对/URL 导入', () => {
    expect(() => validateEffectSource(`import "./util";\n${okEntry}`)).toThrow('只能导入')
    expect(() => validateEffectSource(`import x from "https://evil.example/x.js";\n${okEntry}`)).toThrow('只能导入')
  })

  it('拒绝动态 import 与网络/存储/父窗口 API', () => {
    expect(() => validateEffectSource(`${okEntry}\nconst m = import("three");`)).toThrow('动态 import')
    expect(() => validateEffectSource(`${okEntry}\nfetch("/x");`)).toThrow('fetch')
    expect(() => validateEffectSource(`${okEntry}\nnew WebSocket("ws://x");`)).toThrow('WebSocket')
    expect(() => validateEffectSource(`${okEntry}\nlocalStorage.getItem("k");`)).toThrow('持久化存储')
    expect(() => validateEffectSource(`${okEntry}\nwindow.parent.postMessage(1, "*");`)).toThrow('父页面访问')
  })

  it('拒绝超过入口体积上限', () => {
    const huge = `${okEntry}\n// ${'x'.repeat(LIMITS.maxEntryBytes)}`
    expect(() => validateEffectSource(huge)).toThrow('字节')
  })
})

describe('rewriteEffectImports（裸依赖 → vendor URL）', () => {
  it('重写多种 import 形态并保留其它文本', () => {
    const input = [
      'import * as THREE from "three";',
      "import{gsap}from'gsap';", // 无空格 + 单引号
      'import "three";', // 副作用 import
      'import { defineEffect } from "kdanmu-sdk";',
      'const s = "three";', // 普通字符串不应被改写
    ].join('\n')
    const out = rewriteEffectImports(input, VENDOR)
    expect(out).toContain(VENDOR.three)
    expect(out).toContain(VENDOR.gsap)
    expect(out).toContain(VENDOR['kdanmu-sdk'])
    // import 语句里的裸说明符已被替换
    expect(out).not.toMatch(/from\s*["']three["']/)
    expect(out).not.toMatch(/from\s*["']gsap["']/)
    // 普通字符串字面量保持不变
    expect(out).toContain('const s = "three";')
  })

  it('未知说明符保持原样', () => {
    const out = rewriteEffectImports('import x from "other";', VENDOR)
    expect(out).toBe('import x from "other";')
  })
})
