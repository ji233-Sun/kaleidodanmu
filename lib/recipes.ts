import type { Recipe } from "./types";
import { hashString, mulberry32, pick } from "./random";

export const PALETTES: Record<string, string[]> = {
  neon: ["#00a1d6", "#fb7299", "#8b7cf6", "#ffd166", "#7ee0a3"],
  glass: ["#9fd8ff", "#d6ecff", "#ffffff", "#8b7cf6", "#00a1d6"],
  sakura: ["#fb7299", "#ffc2d4", "#ffffff", "#ff8fb1", "#ffd166"],
  cyber: ["#00f0ff", "#ff00a0", "#8b7cf6", "#faff00", "#00a1d6"],
  ember: ["#ff6b35", "#ffd166", "#fb7299", "#ff9f29", "#ffffff"],
  mono: ["#ffffff", "#c9d4e3", "#9aa3b2", "#e8ecf3", "#6b7a90"],
};

const MOTIONS: Recipe["motion"][] = ["spiral", "burst", "orbit", "flow"];

interface KeywordRule {
  match: RegExp;
  name: string;
  apply: (r: Recipe) => void;
}

/** 根据 prompt 关键词推断配方风格，之后由真实 LLM 替换 */
const RULES: KeywordRule[] = [
  {
    match: /玻璃|碎|裂|crystal|shard/i,
    name: "玻璃碎片",
    apply: (r) => {
      r.motion = "burst";
      r.palette = PALETTES.glass;
      r.symmetry = 6;
      r.trail = 0.55;
      r.shardScale = 1.1;
    },
  },
  {
    match: /花|绽放|樱|曼陀罗|mandala|bloom/i,
    name: "繁花曼陀罗",
    apply: (r) => {
      r.motion = "spiral";
      r.palette = PALETTES.sakura;
      r.symmetry = 8;
      r.rotationSpeed = 0.12;
      r.trail = 0.7;
    },
  },
  {
    match: /星|银河|宇宙|轨道|star|orbit|galaxy/i,
    name: "星河轨道",
    apply: (r) => {
      r.motion = "orbit";
      r.palette = PALETTES.neon;
      r.symmetry = 5;
      r.rotationSpeed = 0.2;
      r.trail = 0.8;
    },
  },
  {
    match: /赛博|霓虹|电|cyber|neon/i,
    name: "赛博霓虹",
    apply: (r) => {
      r.motion = "flow";
      r.palette = PALETTES.cyber;
      r.symmetry = 4;
      r.trail = 0.75;
      r.density = 1.4;
    },
  },
  {
    match: /火|燃|焰|ember|fire/i,
    name: "余烬飞旋",
    apply: (r) => {
      r.motion = "spiral";
      r.palette = PALETTES.ember;
      r.symmetry = 6;
      r.rotationSpeed = -0.18;
      r.trail = 0.65;
    },
  },
  {
    match: /雨|流|瀑布|水|rain|flow|river/i,
    name: "流光溢彩",
    apply: (r) => {
      r.motion = "flow";
      r.palette = PALETTES.neon;
      r.symmetry = 3;
      r.trail = 0.6;
      r.density = 1.3;
    },
  },
];

export function defaultRecipe(seedText: string): Recipe {
  const rand = mulberry32(hashString(seedText || "kaleido"));
  return {
    symmetry: 3 + Math.floor(rand() * 6),
    rotationSpeed: 0.08 + rand() * 0.2,
    motion: pick(rand, MOTIONS),
    palette: PALETTES.neon,
    shardScale: 0.9 + rand() * 0.5,
    trail: 0.4 + rand() * 0.4,
    density: 0.8 + rand() * 0.6,
  };
}

/** 根据用户 prompt 生成配方（mock：关键词规则 + 种子随机兜底） */
export function recipeFromPrompt(prompt: string): { name: string; recipe: Recipe } {
  const recipe = defaultRecipe(prompt);
  for (const rule of RULES) {
    if (rule.match.test(prompt)) {
      rule.apply(recipe);
      return { name: rule.name, recipe };
    }
  }
  return { name: "幻彩流光", recipe };
}

/** 迭代指令：在既有配方上增量修改（mock） */
export function refineRecipe(
  recipe: Recipe,
  instruction: string,
): { recipe: Recipe; changes: string[] } {
  const next: Recipe = { ...recipe, palette: [...recipe.palette] };
  const changes: string[] = [];
  const t = instruction;

  if (/更快|加速|快一点/.test(t)) {
    next.rotationSpeed = Math.min(0.6, next.rotationSpeed * 1.6);
    changes.push(`旋转速度提升 → ${next.rotationSpeed.toFixed(2)} 圈/秒`);
  }
  if (/更慢|减速|慢一点|温柔/.test(t)) {
    next.rotationSpeed = Math.max(0.02, next.rotationSpeed * 0.6);
    changes.push(`旋转速度降低 → ${next.rotationSpeed.toFixed(2)} 圈/秒`);
  }
  if (/反转|反向|逆时针/.test(t)) {
    next.rotationSpeed = -next.rotationSpeed;
    changes.push("旋转方向反转");
  }
  if (/更多|碎片.*多|更密|密集|热闹/.test(t)) {
    next.symmetry = Math.min(12, next.symmetry + 2);
    next.density = Math.min(2, next.density * 1.3);
    changes.push(`对称数 → ${next.symmetry}，弹幕密度提升`);
  }
  if (/更少|稀疏|简洁|少一点|干净/.test(t)) {
    next.symmetry = Math.max(3, next.symmetry - 2);
    next.density = Math.max(0.3, next.density * 0.7);
    changes.push(`对称数 → ${next.symmetry}，弹幕密度降低`);
  }
  if (/粉|樱/.test(t)) {
    next.palette = PALETTES.sakura;
    changes.push("配色切换 → 樱花粉");
  } else if (/蓝|冰|玻璃/.test(t)) {
    next.palette = PALETTES.glass;
    changes.push("配色切换 → 冰晶蓝");
  } else if (/赛博|霓虹/.test(t)) {
    next.palette = PALETTES.cyber;
    changes.push("配色切换 → 赛博霓虹");
  } else if (/火|暖/.test(t)) {
    next.palette = PALETTES.ember;
    changes.push("配色切换 → 暖色余烬");
  }
  if (/拖影|残影|轨迹/.test(t)) {
    next.trail = Math.min(0.9, next.trail + 0.2);
    changes.push(`拖影增强 → ${next.trail.toFixed(2)}`);
  }
  if (/爆|炸开|迸/.test(t)) {
    next.motion = "burst";
    changes.push("运动模式 → burst 迸发");
  } else if (/螺旋|旋/.test(t)) {
    next.motion = "spiral";
    changes.push("运动模式 → spiral 螺旋");
  } else if (/轨道|环绕/.test(t)) {
    next.motion = "orbit";
    changes.push("运动模式 → orbit 轨道");
  } else if (/流动|飘/.test(t)) {
    next.motion = "flow";
    changes.push("运动模式 → flow 流动");
  }

  if (changes.length === 0) {
    // 未识别的指令：随机微调，模拟“Agent 做了一些尝试”
    const rand = mulberry32(hashString(t));
    next.rotationSpeed = Math.max(0.02, next.rotationSpeed * (0.8 + rand() * 0.5));
    next.shardScale = Math.max(0.5, Math.min(2, next.shardScale * (0.9 + rand() * 0.3)));
    next.trail = Math.max(0, Math.min(0.9, next.trail + (rand() - 0.5) * 0.3));
    changes.push("微调了旋转速度、碎片缩放与拖影参数");
  }
  return { recipe: next, changes };
}
