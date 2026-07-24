/** 归一化弹幕事件与兼容配方现由 kdanmu-sdk 统一定义，这里 re-export 保持既有导入路径。 */
import type { DanmakuEvent, Recipe } from "kdanmu-sdk";
export type { DanmakuEvent, Recipe };

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
  /** 云端是否已有 Published 版本 */
  published?: boolean;
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
