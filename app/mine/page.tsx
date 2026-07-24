"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import type { KaleidoEffect } from "@/lib/types";
import {
  deleteEffect,
  getEffectsServerSnapshot,
  getEffectsSnapshot,
  subscribeEffects,
  upsertEffect,
} from "@/lib/store";
import { EffectThumb } from "@/components/effect-thumb";
import { MeSubnav } from "@/components/me/me-subnav";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import type { DraftDto, EffectDto, EffectListResponse } from "@/types";
import { RecipeSchema } from "@/lib/ade/project";

function restoreCloudEffect(effect: EffectDto, draft: DraftDto | null): KaleidoEffect | null {
  let snapshot: Partial<KaleidoEffect> = {};
  if (draft) {
    try { snapshot = JSON.parse(draft.snapshotJson) as Partial<KaleidoEffect>; } catch { snapshot = {}; }
  }
  const recipeResult = RecipeSchema.safeParse(snapshot.recipe ?? effect.recipe);
  if (!recipeResult.success) return null;
  return {
    id: `cloud-${effect.id}`,
    serverId: effect.id,
    name: effect.name,
    prompt: typeof snapshot.prompt === "string" ? snapshot.prompt : effect.prompt,
    recipe: recipeResult.data,
    entrySource: typeof snapshot.entrySource === "string" ? snapshot.entrySource : undefined,
    version: typeof snapshot.version === "number" ? snapshot.version : 1,
    createdAt: Date.parse(effect.createdAt),
    updatedAt: Date.parse(draft?.updatedAt ?? effect.updatedAt),
    forkedFrom: effect.forkedFrom ? String(effect.forkedFrom) : undefined,
    shared: effect.visibility === "public" && effect.publishedVersionId !== null,
    published: effect.publishedVersionId !== null,
  };
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function MinePage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  const [cloudError, setCloudError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const effects = useSyncExternalStore(
    subscribeEffects,
    getEffectsSnapshot,
    getEffectsServerSnapshot,
  );
  // SSR / 首帧水合期间快照为空，避免闪烁空态
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void Promise.resolve().then(() => !cancelled && setSyncing(true));
    void apiFetch<EffectListResponse>("/api/effects")
      .then(async ({ effects: cloudEffects }) => {
        const restored = await Promise.all(cloudEffects.map(async (effect) => {
          const { draft } = await apiFetch<{ draft: DraftDto | null }>(`/api/effects/${effect.id}/draft`);
          return restoreCloudEffect(effect, draft);
        }));
        if (cancelled) return;
        restored.forEach((effect) => {
          if (!effect) return;
          const existing = getEffectsSnapshot().find((item) => item.serverId === effect.serverId);
          if (existing && existing.updatedAt > effect.updatedAt) {
            upsertEffect({
              ...existing,
              shared: effect.shared,
              published: effect.published,
              forkedFrom: effect.forkedFrom,
            });
          } else {
            upsertEffect(existing ? { ...effect, id: existing.id } : effect);
          }
        });
        setCloudError("");
      })
      .catch((e: unknown) => !cancelled && setCloudError(e instanceof Error ? e.message : "云端作品同步失败"))
      .finally(() => !cancelled && setSyncing(false));
    return () => { cancelled = true; };
  }, [user]);

  const remove = useCallback(async (effect: KaleidoEffect) => {
    if (effect.serverId) await apiFetch(`/api/effects/${effect.serverId}`, { method: "DELETE" });
    deleteEffect(effect.id);
  }, []);

  const toggleShare = useCallback(async (effect: KaleidoEffect) => {
    if (!effect.serverId) {
      router.push(`/studio?id=${effect.id}`);
      return;
    }
    if (!effect.shared && !effect.published) {
      setCloudError("请先进入 Studio 上传版本并设为 Published，再公开到广场");
      return;
    }
    await apiFetch(`/api/effects/${effect.serverId}`, {
      method: "PATCH",
      json: { visibility: effect.shared ? "private" : "public" },
    });
    upsertEffect({ ...effect, shared: !effect.shared, updatedAt: Date.now() });
  }, [router]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <MeSubnav active="/mine" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">我的作品</h1>
          <p className="mt-1 text-sm text-ink-2">
            管理你创建的所有弹幕配方，点击卡片继续对话迭代。
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-bili-pink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bili-pink-hover"
        >
          + 新建作品
        </Link>
      </div>

      {cloudError && <p className="mb-4 text-sm text-error">{cloudError}</p>}
      {(sessionLoading || syncing) && <p className="mb-4 text-xs text-ink-3">正在同步云端作品…</p>}

      {!hydrated ? null : effects.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-card py-20">
          <span className="h-8 w-8 rotate-45 rounded-lg bg-linear-to-br from-bili-blue via-bili-purple to-bili-pink opacity-60" />
          <p className="text-sm text-ink-2">还没有作品，用一句话创建你的第一个 Kaleido Danmu 作品吧</p>
          <Link href="/" className="text-sm font-medium text-bili-pink hover:underline">
            去创建 →
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {effects.map((fx) => (
            <div
              key={fx.id}
              className="group overflow-hidden rounded-2xl border border-line bg-card transition-all hover:-translate-y-0.5 hover:border-bili-pink/40 hover:shadow-lg"
            >
              <button
                onClick={() => router.push(`/studio?id=${fx.id}`)}
                className="block w-full cursor-pointer"
                title="预览并继续迭代"
              >
                <EffectThumb recipe={fx.recipe} seedText={fx.id} />
              </button>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => router.push(`/studio?id=${fx.id}`)}
                    className="truncate text-sm font-semibold text-ink hover:text-bili-pink"
                  >
                    {fx.name}
                  </button>
                  <span className="flex-none rounded-full bg-bili-purple-light px-1.5 py-0.5 text-[10px] font-medium text-bili-purple">
                    v{fx.version}
                  </span>
                  {fx.forkedFrom && (
                    <span className="flex-none rounded-full bg-bili-blue-light px-1.5 py-0.5 text-[10px] text-bili-blue">
                      二创
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-ink-3" title={fx.prompt}>
                  「{fx.prompt}」
                </p>
                <p className="mt-2 text-[11px] text-ink-3">更新于 {fmtTime(fx.updatedAt)}</p>
                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                  <Link
                    href={`/studio?id=${fx.id}`}
                    className="rounded-md bg-bili-pink px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-bili-pink-hover"
                  >
                    继续创作
                  </Link>
                  <button
                    onClick={() => void toggleShare(fx).catch((e: unknown) => setCloudError(e instanceof Error ? e.message : "分享设置失败"))}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs transition-colors",
                      fx.shared
                        ? "bg-success-light text-success"
                        : "bg-fill text-ink-2 hover:text-bili-pink",
                    )}
                  >
                    {fx.shared ? "已分享" : "分享"}
                  </button>
                  <button
                    onClick={() => void remove(fx).catch((e: unknown) => setCloudError(e instanceof Error ? e.message : "删除失败"))}
                    className="ml-auto rounded-md px-2 py-1 text-xs text-ink-3 transition-colors hover:bg-error-light hover:text-error"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
