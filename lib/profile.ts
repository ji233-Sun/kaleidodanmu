import type { SquareItem } from "./types";
import { SQUARE_ITEMS } from "./square";
import { hashString, mulberry32 } from "./random";

/**
 * 个人主页 mock 后端。
 * 所有函数以 Promise 返回，模拟真实 API 调用；接入后端后替换为 fetch。
 */

export interface DerivativeWork {
  /** 二创作品 id（对应广场作品 id） */
  id: string;
  name: string;
  author: string;
  authorAvatarHue: string;
  likes: number;
  createdAt: number;
}

export interface PublishedEffect extends SquareItem {
  coins: number;
  favorites: number;
}

export interface UserProfile {
  name: string;
  avatarHue: string;
  bio: string;
  joinedAt: number;
  followers: number;
  /** 发布的作品 */
  effects: PublishedEffect[];
  /** 聚合统计 */
  totalLikes: number;
  totalCoins: number;
  totalFavorites: number;
  totalRemixes: number;
}

const USER_BIOS: Record<string, string> = {
  碎镜师傅: "专注碎裂美学十年，弹幕越碎越好看。",
  花见小路: "樱花季限定 UP 主，其他时间也在画花。",
  轨道清洁工: "把弹幕扫进银河轨道的人。",
  夜之城居民: "霓虹不灭，弹幕不停。",
  烤火观众: "冬天就适合看点暖和的弹幕。",
  少即是多: "删到不能再删，就是我的风格。",
  光学爱好者: "研究弹幕的光学性质。",
};

/** 由作品 id 确定性生成投币 / 收藏数（与点赞同量级但更少） */
function enrich(item: SquareItem): PublishedEffect {
  const rand = mulberry32(hashString(`stats:${item.id}`));
  return {
    ...item,
    coins: Math.floor(item.likes * (0.15 + rand() * 0.2)),
    favorites: Math.floor(item.likes * (0.25 + rand() * 0.25)),
  };
}

function mockDelay(ms = 260) {
  return new Promise((r) => setTimeout(r, ms));
}

/** GET /api/users/:name —— 用户资料 + 发布的作品 + 聚合统计 */
export async function fetchUserProfile(name: string): Promise<UserProfile | null> {
  await mockDelay();
  const effects = SQUARE_ITEMS.filter((i) => i.author === name).map(enrich);
  if (effects.length === 0) return null;
  const rand = mulberry32(hashString(`user:${name}`));
  return {
    name,
    avatarHue: effects[0].authorAvatarHue,
    bio: USER_BIOS[name] ?? "这个人很神秘，什么都没有留下。",
    joinedAt: Date.now() - 86400e3 * (180 + Math.floor(rand() * 500)),
    followers: 200 + Math.floor(rand() * 8000),
    effects,
    totalLikes: effects.reduce((s, e) => s + e.likes, 0),
    totalCoins: effects.reduce((s, e) => s + e.coins, 0),
    totalFavorites: effects.reduce((s, e) => s + e.favorites, 0),
    totalRemixes: effects.reduce((s, e) => s + e.remixes, 0),
  };
}

/** GET /api/effects/:id —— 单个广场作品详情（含投币 / 收藏数） */
export async function fetchSquareEffect(id: string): Promise<PublishedEffect | null> {
  await mockDelay();
  const item = SQUARE_ITEMS.find((i) => i.id === id);
  return item ? enrich(item) : null;
}

/** GET /api/effects/:id/derivatives —— 某作品的二创列表（关联查看） */
export async function fetchDerivatives(effectId: string): Promise<DerivativeWork[]> {
  await mockDelay();
  const source = SQUARE_ITEMS.find((i) => i.id === effectId);
  if (!source) return [];
  // mock：确定性从广场其他作品中挑出 remixCount 条作为二创
  const rand = mulberry32(hashString(`forks:${effectId}`));
  const pool = SQUARE_ITEMS.filter((i) => i.id !== effectId && i.author !== source.author);
  const picked: DerivativeWork[] = [];
  const count = Math.min(source.remixes, pool.length);
  while (picked.length < count) {
    const item = pool[Math.floor(rand() * pool.length)];
    if (picked.some((p) => p.id === item.id)) continue;
    picked.push({
      id: item.id,
      name: item.name,
      author: item.author,
      authorAvatarHue: item.authorAvatarHue,
      likes: item.likes,
      createdAt: item.createdAt + 86400e3 * rand(),
    });
  }
  return picked.sort((a, b) => b.createdAt - a.createdAt);
}

export type InteractionKind = "like" | "coin" | "favorite";

/** POST /api/effects/:id/interactions —— 点赞 / 投币 / 收藏 */
export async function postInteraction(
  effectId: string,
  kind: InteractionKind,
  on: boolean,
): Promise<{ ok: true }> {
  void effectId;
  void kind;
  void on;
  await mockDelay(180);
  return { ok: true };
}
