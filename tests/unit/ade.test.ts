import { describe, expect, it } from "vitest";
import { AdeAgentTurnRequestSchema } from "@/lib/ade/protocol";
import { ADE_GUIDE_FILE } from "@/lib/ade/guide";
import { BrowserEffectProject } from "@/lib/ade/project";
import { DEFAULT_EFFECT_SOURCE, rewriteEffectImports, validateEffectSource } from "@/lib/runtime/effect";
import { AdeSessionPayloadSchema } from "@/types";
import type { Recipe } from "@/lib/types";

const recipe: Recipe = {
  symmetry: 6, rotationSpeed: 0.2, motion: "spiral", palette: ["#00a1d6", "#fb7299"], shardScale: 1, trail: 0.6, density: 1,
};

describe("ADE request contract", () => {
  it("accepts a single design instruction followed by local tool results", () => {
    expect(AdeAgentTurnRequestSchema.parse({ messages: [
      { role: "user", content: "做一个蓝色玻璃碎片效果" },
      { role: "assistant", content: "", toolCalls: [{ id: "call_1", name: "read_file", arguments: '{"path":"effect.json"}' }], reasoningContent: "inspect the project" },
      { role: "tool", toolCallId: "call_1", content: "{}" },
    ] }).messages).toHaveLength(3);
  });

  it("rejects arbitrary multi-user chat history", () => {
    expect(() => AdeAgentTurnRequestSchema.parse({ messages: [
      { role: "user", content: "先做一个效果" },
      { role: "user", content: "再回答一个无关问题" },
    ] })).toThrow();
  });
  it("accepts very long assistant and tool content (no client-side caps)", () => {
    const longText = "x".repeat(20_000);
    expect(() => AdeAgentTurnRequestSchema.parse({ messages: [
      { role: "user", content: "调一下" },
      { role: "assistant", content: longText, toolCalls: [{ id: "c1", name: "validate", arguments: "{}" }] },
      { role: "tool", toolCallId: "c1", content: longText },
    ] })).not.toThrow();
  });
});

describe("browser Effect project", () => {
  it("only applies a preview after validated browser-local files", () => {
    const project = new BrowserEffectProject();
    project.hydrate("初始效果", recipe);
    const content = JSON.stringify({ name: "玻璃碎片", recipe: { ...recipe, motion: "burst" } });
    expect(project.execute({ id: "1", name: "write_file", arguments: JSON.stringify({ path: "effect.json", content }) }).result).toContain("已写入");
    expect(project.execute({ id: "2", name: "validate", arguments: "{}" }).result).toContain("校验通过");
    const refreshed = project.execute({ id: "3", name: "refresh_preview", arguments: "{}" });
    expect(refreshed.preview?.recipe.motion).toBe("burst");
    expect(refreshed.preview?.entrySource).toBe(DEFAULT_EFFECT_SOURCE);
  });

  it("rejects paths and unsafe entry code", () => {
    const project = new BrowserEffectProject();
    project.hydrate("初始效果", recipe);
    expect(project.execute({ id: "1", name: "read_file", arguments: JSON.stringify({ path: "../.env" }) }).result).toContain("工具失败");
    expect(project.execute({ id: "2", name: "write_file", arguments: JSON.stringify({ path: "index.ts", content: "fetch('https://example.test')" }) }).result).toContain("不允许使用 fetch");
  });

  it("serves the SDK guide as a read-only virtual file", () => {
    const project = new BrowserEffectProject();
    project.hydrate("初始效果", recipe);
    const guide = project.execute({ id: "1", name: "read_file", arguments: JSON.stringify({ path: ADE_GUIDE_FILE }) });
    expect(guide.result).toContain("onDanmaku");
    expect(guide.result).toContain("DanmakuEvent");
    expect(guide.result).toContain("x < endX");
    expect(guide.result).toContain("delta / 1000");
    expect(guide.result).toContain("textWidth / 2");
    expect(guide.result).toContain("完整穿屏");
    expect(guide.result).toContain("容量限制不能删除仍在屏幕内的旧弹幕");
    expect(
      project.execute({ id: "2", name: "write_file", arguments: JSON.stringify({ path: ADE_GUIDE_FILE, content: "x" }) }).result,
    ).toContain("只读");
  });
});

describe("ADE session payload contract", () => {
  it("accepts agent work messages (reasoning + tool calls) alongside chat texts", () => {
    expect(() =>
      AdeSessionPayloadSchema.parse({
        messages: [
          { role: "user", text: "做一个可以自由绘制的蓝色 Canvas" },
          { role: "reasoning", text: "先看下工程结构" },
          { role: "assistant", text: "我先读取工程文件。" },
          { role: "tool", name: "read_file", summary: "index.ts", status: "ok" },
          { role: "tool", name: "refresh_preview", summary: "", status: "error", detail: "没有可刷新的改动" },
        ],
        files: { "effect.json": "{}", "index.ts": "x" },
      }),
    ).not.toThrow();
  });

  it("rejects unknown tool names in persisted history", () => {
    expect(() =>
      AdeSessionPayloadSchema.parse({
        messages: [{ role: "tool", name: "exec_shell", summary: "", status: "ok" }],
        files: { "effect.json": "", "index.ts": "" },
      }),
    ).toThrow();
  });
});

describe("Effect Runtime source contract", () => {
  it("accepts and rewrites the built-in Three.js/GSAP effect imports to vendor URLs", () => {
    expect(() => validateEffectSource(DEFAULT_EFFECT_SOURCE)).not.toThrow();
    const vendor = {
      three: "/kaleido-runtime/vendor/three.mjs",
      gsap: "/kaleido-runtime/vendor/gsap.mjs",
      "kdanmu-sdk": "/kaleido-runtime/vendor/kaleido-sdk.mjs",
    };
    const out = rewriteEffectImports(DEFAULT_EFFECT_SOURCE, vendor);
    expect(out).not.toContain('from "three"');
    expect(out).toContain("/kaleido-runtime/vendor/three.mjs");
    expect(out).toContain("/kaleido-runtime/vendor/kaleido-sdk.mjs");
    // 不再改写为 return——保持真 ESM 的默认导出
    expect(out).toContain("export default defineEffect({");
    expect(DEFAULT_EFFECT_SOURCE).not.toContain("remove(active.values().next().value)");
  });

  it("rejects unbundled dependencies and parent-page access", () => {
    expect(() => validateEffectSource(`
      import thing from "external-package";
      export default defineEffect({ setup() { return { onDanmaku() {} }; } });
    `)).toThrow("只能导入");
    expect(() => validateEffectSource(`
      export default defineEffect({
        setup() { window.parent.postMessage("secret", "*"); return { onDanmaku() {} }; }
      });
    `)).toThrow("父页面访问");
  });

  it("allows a pointer-driven Canvas effect without danmaku input", () => {
    expect(() => validateEffectSource(`
      export default defineEffect({
        setup() {
          return {
            onPointer(event) { void event.x; },
            render() {},
            resize() {},
            dispose() {},
          };
        },
      });
    `)).not.toThrow();
  });
});
