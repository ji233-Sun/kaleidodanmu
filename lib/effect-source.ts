"use client";

import { apiFetch } from "./api";
import { DEFAULT_EFFECT_SOURCE, type RuntimeAsset } from "./runtime/effect";
import { defaultRecipe } from "./recipes";
import type { Recipe } from "./types";
import { RecipeSchema } from "@/types/manifest";
import type { DraftDto, EffectDto, VersionArtifactResponse } from "@/types";

/** 一个 Effect 的可运行形态：入口源码 + 随包资源 + 配方。 */
export interface ResolvedEffectSource {
  /** 可执行入口 ESM 源码（版本产物 / 网页自定义入口 / 内置默认引擎）。 */
  source: string;
  assets?: RuntimeAsset[];
  recipe: Recipe;
  /** true = 来自版本产物（效果包）；false = 网页配方走内置引擎。 */
  packaged: boolean;
}

export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** EffectDto.recipe 可能是 {}（CLI 上传未回填），解析失败时回退到按 slug 派生的默认配方。 */
export function resolveEffectRecipe(effect: EffectDto): Recipe {
  const parsed = RecipeSchema.safeParse(effect.recipe);
  return parsed.success ? parsed.data : defaultRecipe(effect.slug);
}

/** 版本产物的 manifest 里携带了权威配方，优先于 EffectDto 上的回填。 */
function recipeFromManifest(manifestJson: string): Recipe | null {
  try {
    const parsed = RecipeSchema.safeParse(
      (JSON.parse(manifestJson) as { recipe?: unknown }).recipe,
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function fetchArtifact(
  effectId: number,
  channel: "draft" | "staging" | "published",
): Promise<VersionArtifactResponse> {
  return apiFetch<VersionArtifactResponse>(
    `/api/effects/${effectId}/artifact?channel=${channel}`,
  );
}

export interface EffectSourceQuery {
  effectId: number;
  recipe: Recipe;
  /** 预览渠道：owner 看自己的用 draft（自动回退 staging/published），广场用 published。 */
  channel: "draft" | "published";
  /** 是否可能存在版本产物；404 时会自动回退，不确定就传 true。 */
  maybePackaged: boolean;
  /** 网页草稿快照里的自定义入口（已知时直接给，省去一次 draft 请求）。 */
  entrySource?: string;
}

/**
 * 解析 Effect 的真实可运行源码：
 * 版本产物（编译后 ESM）→ 网页草稿快照的自定义入口 → 内置默认引擎。
 */
export async function fetchEffectSource(query: EffectSourceQuery): Promise<ResolvedEffectSource> {
  const { effectId, recipe, channel, maybePackaged } = query;
  let { entrySource } = query;

  if (maybePackaged) {
    const channels =
      channel === "draft" ? (["draft", "staging", "published"] as const) : (["published"] as const);
    for (const ch of channels) {
      try {
        const art = await fetchArtifact(effectId, ch);
        return {
          source: decodeBase64Utf8(art.entry.data),
          assets: art.assets,
          recipe: recipeFromManifest(art.manifestJson) ?? recipe,
          packaged: true,
        };
      } catch {
        // 该渠道无版本产物，尝试下一个
      }
    }
  }

  // 网页作品：自定义入口存在草稿快照里（仅 owner 可读 draft 快照）
  if (channel === "draft" && entrySource === undefined) {
    try {
      const { draft } = await apiFetch<{ draft: DraftDto | null }>(`/api/effects/${effectId}/draft`);
      if (draft) {
        const snapshot = JSON.parse(draft.snapshotJson) as { entrySource?: unknown };
        if (typeof snapshot.entrySource === "string") entrySource = snapshot.entrySource;
      }
    } catch {
      // 无草稿或无权限，回退默认引擎
    }
  }
  if (entrySource?.trim()) {
    return { source: entrySource, recipe, packaged: false };
  }

  return { source: DEFAULT_EFFECT_SOURCE, recipe, packaged: false };
}
