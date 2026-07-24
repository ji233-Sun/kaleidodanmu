import type {
  DerivativeListResponse,
  EffectDetailDto,
  InteractionKind,
  InteractionResponse,
  SquareEffectDto,
  SquareListResponse,
  UserProfileDto,
} from "@/types";
import { apiFetch, ApiError } from "./api";
import { RecipeSchema } from "./ade/project";
import type { Recipe, SquareItem } from "./types";

export interface DerivativeWork {
  id: string;
  name: string;
  author: string;
  authorHandle: string;
  authorAvatarHue: string;
  likes: number;
  createdAt: number;
}

export interface PublishedEffect extends SquareItem {
  authorHandle: string;
  coins: number;
  favorites: number;
  interacted?: { like: boolean; coin: boolean; favorite: boolean } | null;
}

export interface UserProfile {
  name: string;
  displayName: string;
  avatarHue: string;
  bio: string;
  joinedAt: number;
  followers: number;
  effects: PublishedEffect[];
  totalLikes: number;
  totalCoins: number;
  totalFavorites: number;
  totalRemixes: number;
}

function recipeOf(value: Record<string, unknown>): Recipe | null {
  const result = RecipeSchema.safeParse(value);
  return result.success ? result.data : null;
}

function effectOf(item: SquareEffectDto): PublishedEffect | null {
  const recipe = recipeOf(item.recipe);
  if (!recipe) return null;
  return {
    id: String(item.id),
    name: item.name,
    prompt: item.prompt,
    recipe,
    author: item.author.displayName,
    authorHandle: item.author.name,
    authorAvatarHue: item.author.avatarHue,
    likes: item.likes,
    uses: item.uses,
    remixes: item.remixes,
    coins: item.coins,
    favorites: item.favorites,
    tags: item.tags,
    createdAt: Date.parse(item.createdAt),
  };
}

export async function fetchSquare(): Promise<PublishedEffect[]> {
  const data = await apiFetch<SquareListResponse>("/api/square?limit=50");
  return data.items.map(effectOf).filter((e): e is PublishedEffect => e !== null);
}

export async function fetchUserProfile(name: string): Promise<UserProfile | null> {
  try {
    const data = await apiFetch<UserProfileDto>(`/api/users/${encodeURIComponent(name)}`);
    return {
      name: data.user.name,
      displayName: data.user.displayName,
      avatarHue: data.user.avatarHue,
      bio: data.user.bio,
      joinedAt: Date.parse(data.user.createdAt),
      followers: data.followers,
      effects: data.effects.map(effectOf).filter((e): e is PublishedEffect => e !== null),
      totalLikes: data.totalLikes,
      totalCoins: data.totalCoins,
      totalFavorites: data.totalFavorites,
      totalRemixes: data.totalRemixes,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function fetchSquareEffect(id: string): Promise<PublishedEffect | null> {
  try {
    const item = await apiFetch<EffectDetailDto>(`/api/square/${encodeURIComponent(id)}`);
    const effect = effectOf(item);
    if (!effect) return null;
    return { ...effect, interacted: item.interacted };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function fetchDerivatives(effectId: string): Promise<DerivativeWork[]> {
  const data = await apiFetch<DerivativeListResponse>(
    `/api/effects/${encodeURIComponent(effectId)}/derivatives`,
  );
  return data.items.map((item) => ({
    id: String(item.id),
    name: item.name,
    author: item.author.displayName,
    authorHandle: item.author.name,
    authorAvatarHue: item.author.avatarHue,
    likes: item.likes,
    createdAt: Date.parse(item.createdAt),
  }));
}

export async function postInteraction(
  effectId: string,
  kind: InteractionKind,
  on: boolean,
): Promise<InteractionResponse> {
  return apiFetch(`/api/effects/${encodeURIComponent(effectId)}/interactions`, {
    method: "POST",
    json: { kind, on },
  });
}
