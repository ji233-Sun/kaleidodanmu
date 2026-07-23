import type { Recipe } from "./types";

/**
 * Mock Agent 脚本：模拟 pi 二开的浏览器内 Coding Agent 的工作过程。
 * 之后接入真实 Agent 内核时，本模块由真实的 agent loop 事件流替换。
 */
export type AgentStep =
  | { type: "say"; text: string }
  | { type: "tool"; tool: string; args: string; result: string; duration?: number }
  | { type: "apply"; name?: string; recipe: Recipe; changes?: string[] };

export function buildCreationScript(
  prompt: string,
  name: string,
  recipe: Recipe,
): AgentStep[] {
  return [
    {
      type: "say",
      text: `收到，我来为你创建这个万花筒效果。\n\n先理解一下需求：「${prompt}」——我打算用「${name}」方案来实现：${recipe.symmetry} 重对称、${motionLabel(recipe.motion)} 运动、${recipe.palette.length} 色策略。`,
    },
    {
      type: "tool",
      tool: "write_file",
      args: "effect.json",
      result: `已写入配方：symmetry=${recipe.symmetry}, motion=${recipe.motion}, rotation=${recipe.rotationSpeed.toFixed(2)}, trail=${recipe.trail.toFixed(2)}`,
      duration: 900,
    },
    {
      type: "tool",
      tool: "write_file",
      args: "index.ts",
      result: "已生成单入口 ES Module（setup / onEvent / render / dispose 生命周期）",
      duration: 1400,
    },
    {
      type: "tool",
      tool: "validate",
      args: "--schema --limits",
      result: "✓ schema 校验通过 · 包体 12.4 KB < 1 MB · 无网络请求 · 活跃弹幕 < 200",
      duration: 1100,
    },
    {
      type: "tool",
      tool: "refresh_preview",
      args: "",
      result: "沙箱预览已刷新",
      duration: 700,
    },
    {
      type: "say",
      text: "效果已经生成并在右侧预览了，视频播放时可以看到弹幕经过万花筒渲染的样子。\n\n不满意的话直接告诉我怎么改，比如「碎片再多一点」「换成粉色系」「旋转再快一些」。",
    },
    { type: "apply", name, recipe },
  ];
}

export function buildRefineScript(
  instruction: string,
  changes: string[],
  recipe: Recipe,
): AgentStep[] {
  return [
    {
      type: "say",
      text: `好的，我来调整：${changes.map((c) => `「${c}」`).join("、")}。`,
    },
    {
      type: "tool",
      tool: "edit_file",
      args: "effect.json",
      result: changes.join("；"),
      duration: 800,
    },
    {
      type: "tool",
      tool: "validate",
      args: "--schema --limits",
      result: "✓ 校验通过",
      duration: 700,
    },
    {
      type: "tool",
      tool: "refresh_preview",
      args: "",
      result: "预览已刷新，新版本已保存",
      duration: 600,
    },
    { type: "apply", recipe, changes },
  ];
}

function motionLabel(m: Recipe["motion"]): string {
  return { spiral: "螺旋扩散", burst: "迸发碎裂", orbit: "轨道环绕", flow: "流光穿行" }[m];
}
