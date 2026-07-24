/** 归一化弹幕事件（与 docs 技术方案 §4 对齐） */
export interface DanmakuEvent {
  id: string;
  source: "vod" | "live";
  text: string;
  videoTimeMs?: number;
  receivedAt: number;
  mode: "scroll" | "top" | "bottom";
  color: number;
  fontSize: number;
  weight: number;
  seed: number;
}

/** 兼容配方：为旧作品保留的声明式基础参数，不限制 Canvas 的实际表现。 */
export interface Recipe {
  /** 对称切片数 3-12 */
  symmetry: number;
  /** 旋转速度（圈/秒，可正可负） */
  rotationSpeed: number;
  /** 碎片运动模式 */
  motion: "spiral" | "burst" | "orbit" | "flow";
  /** 色彩策略 */
  palette: string[];
  /** 碎片缩放 */
  shardScale: number;
  /** 拖影强度 0-0.9 */
  trail: number;
  /** 弹幕密度倍率 0.3-2 */
  density: number;
}

/** 本地 Canvas 作品草稿。 */
export interface KaleidoEffect {
  id: string;
  name: string;
  prompt: string;
  recipe: Recipe;
  /** ADE 生成的受限 Effect 入口；旧草稿缺省时使用内置入口 */
  entrySource?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  /** 二创来源（广场作品 id） */
  forkedFrom?: string;
  /** 是否已分享到广场 */
  shared?: boolean;
  /** 关联的服务端 Effect id（未同步到云端时为空） */
  serverId?: number;
}

/** 广场作品 */
export interface SquareItem {
  id: string;
  name: string;
  prompt: string;
  recipe: Recipe;
  author: string;
  authorAvatarHue: string;
  likes: number;
  uses: number;
  remixes: number;
  tags: string[];
  createdAt: number;
}
