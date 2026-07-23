import { describe, expect, it } from "vitest";
import { AdeAgentTurnRequestSchema } from "@/lib/ade/protocol";
import { BrowserEffectProject } from "@/lib/ade/project";
import { DEFAULT_EFFECT_SOURCE, transformEffectSource, validateEffectSource } from "@/lib/runtime/effect";
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
});

describe("Effect Runtime source contract", () => {
  it("accepts and transforms the built-in Three.js/GSAP effect", () => {
    expect(() => validateEffectSource(DEFAULT_EFFECT_SOURCE)).not.toThrow();
    const body = transformEffectSource(DEFAULT_EFFECT_SOURCE);
    expect(body).not.toContain('from "three"');
    expect(body).toContain("return defineEffect({");
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
});
