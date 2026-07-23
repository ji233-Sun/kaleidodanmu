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

/** 万花筒配方：声明式动效参数，渲染引擎据此绘制 */
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

/** 我的万花筒（本地草稿） */
export interface KaleidoEffect {
  id: string;
  name: string;
  prompt: string;
  recipe: Recipe;
  version: number;
  createdAt: number;
  updatedAt: number;
  /** 二创来源（广场作品 id） */
  forkedFrom?: string;
  /** 是否已分享到广场 */
  shared?: boolean;
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
