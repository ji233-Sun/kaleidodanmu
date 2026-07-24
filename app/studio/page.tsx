"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Recipe } from "@/lib/types";
import { defaultRecipe } from "@/lib/recipes";
import {
  getEffect,
  getEffectsServerSnapshot,
  getEffectsSnapshot,
  newEffectId,
  newStudioSessionId,
  subscribeEffects,
  upsertEffect,
} from "@/lib/store";
import { fetchSquareEffect, type PublishedEffect } from "@/lib/profile";
import { apiFetch, ApiError } from "@/lib/api";
import { hashString } from "@/lib/random";
import { AgentChat } from "@/components/studio/agent-chat";
import { CloudPanel } from "@/components/studio/cloud-panel";
import { KaleidoPlayer } from "@/components/player/kaleido-player";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import { DEFAULT_EFFECT_SOURCE } from "@/lib/runtime/effect";

function StudioInner() {
  const router = useRouter();
  const { user } = useSession();
  const params = useSearchParams();
  const prompt = params.get("prompt") ?? undefined;
  const id = params.get("id");
  const fork = params.get("fork");
  const session = params.get("session")?.trim() || null;

  const effects = useSyncExternalStore(
    subscribeEffects,
    getEffectsSnapshot,
    getEffectsServerSnapshot,
  );
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // 当前编辑的作品 id：?id= 直接取用；?fork= 先复制一份再编辑；?prompt= 首次生成时创建
  const [forkId] = useState<string | null>(() => (fork ? newEffectId() : null));
  const [fallbackSession] = useState(newStudioSessionId);
  const initialId = id ?? forkId;
  const [createdId, setCreatedId] = useState<string | null>(null);
  const forkCreatedRef = useRef(false);
  const [toast, setToast] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [effectError, setEffectError] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<string | null>(null);
  const autoCloudRef = useRef(new Set<string>());

  const [forkItem, setForkItem] = useState<PublishedEffect | null | undefined>(
    fork ? undefined : null,
  );

  useEffect(() => {
    if (!fork) return;
    let cancelled = false;
    fetchSquareEffect(fork)
      .then((item) => !cancelled && setForkItem(item))
      .catch(() => !cancelled && setForkItem(null));
    return () => { cancelled = true; };
  }, [fork]);

  // 兼容直接访问旧式 ?prompt= 链接：补齐实例级会话键，刷新后仍能恢复当前创作。
  useEffect(() => {
    if (!prompt || id || session) return;
    const next = new URLSearchParams(params.toString());
    next.set("session", fallbackSession);
    router.replace(`/studio?${next.toString()}`, { scroll: false });
  }, [fallbackSession, id, params, prompt, router, session]);

  // 广场二创：进入页面即复制一份作品到“我的作品”
  useEffect(() => {
    if (!fork || !forkItem || !forkId || forkCreatedRef.current) return;
    forkCreatedRef.current = true;
    upsertEffect({
      id: forkId,
      name: `${forkItem.name} · 二创`,
      prompt: forkItem.prompt,
      recipe: { ...forkItem.recipe, palette: [...forkItem.recipe.palette] },
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      forkedFrom: forkItem.id,
    });
  }, [fork, forkItem, forkId]);

  const activeId = createdId ?? initialId;
  const effect = activeId ? (effects.find((e) => e.id === activeId) ?? null) : null;

  // Logged-in work is durable by default: establish the cloud Effect and Draft as soon as a local work exists.
  useEffect(() => {
    if (!user || !effect || effect.serverId || agentBusy || autoCloudRef.current.has(effect.id)) return;
    autoCloudRef.current.add(effect.id);
    const slug = `fx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    void apiFetch<{ effect: { id: number } }>("/api/effects", {
      method: "POST",
      json: {
        slug,
        name: effect.name,
        prompt: effect.prompt,
        recipe: effect.recipe,
        ...(effect.forkedFrom && /^\d+$/.test(effect.forkedFrom)
          ? { forkedFrom: Number(effect.forkedFrom) }
          : {}),
      },
    }).then(async ({ effect: cloud }) => {
      const linked = { ...effect, serverId: cloud.id };
      upsertEffect(linked);
      await apiFetch(`/api/effects/${cloud.id}/draft`, {
        method: "PUT",
        json: {
          snapshotJson: JSON.stringify({
            prompt: linked.prompt,
            recipe: linked.recipe,
            entrySource: linked.entrySource ?? DEFAULT_EFFECT_SOURCE,
            version: linked.version,
          }),
        },
      });
      setToast("草稿已自动保存到云端");
      setTimeout(() => setToast(""), 3000);
    }).catch((error: unknown) => {
      autoCloudRef.current.delete(effect.id);
      setToast(error instanceof Error ? `云端自动保存失败：${error.message}` : "云端自动保存失败");
      setTimeout(() => setToast(""), 4000);
    });
  }, [agentBusy, effect, user]);

  useEffect(() => {
    if (!user || !effect?.serverId || agentBusy) return;
    const timer = window.setTimeout(() => {
      const snapshotJson = JSON.stringify({
        prompt: effect.prompt,
        recipe: effect.recipe,
        entrySource: effect.entrySource ?? DEFAULT_EFFECT_SOURCE,
        version: effect.version,
      });
      void Promise.all([
        apiFetch(`/api/effects/${effect.serverId}`, {
          method: "PATCH",
          json: { name: effect.name, prompt: effect.prompt, recipe: effect.recipe },
        }),
        apiFetch(`/api/effects/${effect.serverId}/draft`, {
          method: "PUT",
          json: { snapshotJson },
        }),
      ]).catch((error: unknown) => {
        setToast(error instanceof Error ? `云端同步失败：${error.message}` : "云端同步失败");
        window.setTimeout(() => setToast(""), 4000);
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [agentBusy, effect, user]);

  // Agent 产出新配方：创建或保存新版本
  const handleApply = (recipe: Recipe, name?: string, _changes?: string[], entrySource?: string) => {
    const now = Date.now();
    if (activeId) {
      const cur = getEffect(activeId);
      if (cur) {
        // 配方未变化（如二创初始化回放）时不 bump 版本
        const nextEntrySource = entrySource ?? cur.entrySource;
        const unchanged =
          JSON.stringify(cur.recipe) === JSON.stringify(recipe) &&
          cur.entrySource === nextEntrySource;
        upsertEffect({
          ...cur,
          recipe,
          entrySource: nextEntrySource,
          name: name ?? cur.name,
          version: unchanged ? cur.version : cur.version + 1,
          updatedAt: now,
        });
      }
      return;
    }
    const newId = newEffectId();
    upsertEffect({
      id: newId,
      name: name ?? "未命名作品",
      prompt: prompt ?? "",
      recipe,
      entrySource,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    setCreatedId(newId);
    const next = new URLSearchParams(params.toString());
    next.set("id", newId);
    if (prompt && !session) next.set("session", fallbackSession);
    router.replace(`/studio?${next.toString()}`, { scroll: false });
  };

  const share = async () => {
    if (!effect?.serverId) {
      setToast("请先在下方保存到云端、上传版本并设为 Published");
      setTimeout(() => setToast(""), 4000);
      return;
    }
    try {
      const { effect: cloud } = await apiFetch<{ effect: { publishedVersionId: number | null } }>(
        `/api/effects/${effect.serverId}`,
      );
      if (!cloud.publishedVersionId) {
        setToast("请先上传版本并设为 Published");
      } else {
        await apiFetch(`/api/effects/${effect.serverId}`, {
          method: "PATCH",
          json: { visibility: "public", prompt: effect.prompt, recipe: effect.recipe },
        });
        upsertEffect({ ...effect, shared: true, updatedAt: Date.now() });
        setToast("已公开到创作广场");
      }
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : "分享失败，请稍后重试");
    }
    setTimeout(() => setToast(""), 4000);
  };

  const seed = useMemo(
    () => hashString(activeId ?? prompt ?? "preview"),
    [activeId, prompt],
  );
  const recipe = effect?.recipe ?? defaultRecipe("kaleido-preview");

  // 新一轮生成开始时清掉上一轮的运行错误
  const handleBusyChange = (next: boolean) => {
    setAgentBusy(next);
    if (next) setEffectError(null);
  };

  const notFound = hydrated && ((!!id && !effect) || (!!fork && forkItem === null));
  if (notFound) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-ink-2">没有找到这个作品，可能已被删除。</p>
        <Link href="/mine" className="text-sm text-bili-pink hover:underline">
          返回我的作品 →
        </Link>
      </main>
    );
  }

  const chatKey = session ?? activeId ?? (prompt ? fallbackSession : "blank");
  // 新建流程以实例级 session 保存；作品生成后同步到 id 键，供“我的作品”入口恢复。
  const aliasKeys = activeId && activeId !== chatKey ? [activeId] : [];

  const askAgentToFix = () => {
    if (!effectError) return;
    setOutbox(
      `预览运行时出错：${effectError}。请读取 index.ts 检查并修复这个问题，然后重新校验并刷新预览。`,
    );
  };

  return (
    <main className="flex h-[calc(100dvh-5.25rem)] min-h-0 flex-col overflow-hidden sm:h-[calc(100dvh-3.5rem)] lg:flex-row">
      {/* 左：对话 */}
      <div className="flex h-1/2 min-h-0 flex-none flex-col overflow-hidden border-b border-line bg-card lg:h-auto lg:w-100 lg:border-r lg:border-b-0">
        <AgentChat
          key={chatKey}
          recipe={effect?.recipe ?? null}
          entrySource={effect?.entrySource}
          autoPrompt={prompt ?? (forkItem ? forkItem.prompt : undefined)}
          creationName={forkItem ? `${forkItem.name} · 二创` : undefined}
          creationRecipe={forkItem?.recipe}
          intro={
            !prompt && !forkItem && effect
              ? `已加载「${effect.name}」（当前 v${effect.version}）。\n\n原始需求：「${effect.prompt}」\n\n直接告诉我你想怎么调整画面、动画或交互。`
              : undefined
          }
          targetKey={chatKey}
          aliasKeys={aliasKeys}
          externalPrompt={outbox}
          onExternalPromptConsumed={() => setOutbox(null)}
          onApply={handleApply}
          onBusyChange={handleBusyChange}
          className="min-h-0 flex-1"
        />
      </div>

      {/* 右：预览 + 信息 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-4 px-5 py-5">
          {/* 标题栏 */}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-bold text-ink">{effect?.name ?? "正在创建…"}</h1>
            {effect && (
              <span className="rounded-full bg-bili-purple-light px-2 py-0.5 text-xs font-medium text-bili-purple">
                v{effect.version}
              </span>
            )}
            {effect?.forkedFrom && (
              <span className="rounded-full bg-bili-blue-light px-2 py-0.5 text-xs text-bili-blue">
                二创作品
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {toast && <span className="text-xs text-success">{toast}</span>}
              <button
                onClick={share}
                disabled={!effect || effect.shared}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
                  effect?.shared
                    ? "cursor-default bg-success-light text-success"
                    : "bg-bili-pink text-white hover:bg-bili-pink-hover disabled:opacity-40",
                )}
              >
                {effect?.shared ? "已分享" : "分享到广场"}
              </button>
            </div>
          </div>

          {/* 播放器预览：弹幕是主舞台上的第一层内容，Canvas 负责让它产生新的形态。 */}
          {agentBusy ? (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border border-line bg-card text-sm text-ink-3">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-bili-pink border-t-transparent" />
              Agent 正在生成效果，完成后会在这里展示预览…
            </div>
          ) : effect ? (
            <KaleidoPlayer
              recipe={recipe}
              effectSource={effect?.entrySource}
              seed={seed}
              title={effect?.name ?? "Kaleido Danmu 预览"}
              onEffectError={setEffectError}
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-line bg-card text-sm text-ink-3">
              等待 Agent 生成预览…
            </div>
          )}

          {/* 运行错误：显著提示并可一键让 Agent 修复 */}
          {!agentBusy && effectError && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span className="min-w-0 flex-1 truncate" title={effectError}>
                预览运行出错：{effectError}
              </span>
              <button
                onClick={askAgentToFix}
                className="flex-none rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500"
              >
                让 Agent 修复
              </button>
            </div>
          )}

          {/* 创作能力说明：旧配方继续保存在数据层，但不再作为产品能力边界展示。 */}
          <div className="rounded-xl border border-line bg-card p-4">
            <p className="text-xs font-semibold tracking-wider text-ink-3">弹幕表现层</p>
            <p className="mt-2 text-sm leading-6 text-ink-2">
              每条弹幕都可以成为轨道、粒子、碎片、光带或交互触发器。你可以继续对话，让 Agent 调整它的速度、密度、聚合方式和与画面的关系。
            </p>
          </div>

          {/* 云端版本与发布 */}
          {effect && <CloudPanel key={`${effect.id}:${effect.updatedAt}`} effect={effect} />}
        </div>
      </div>
    </main>
  );
}

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center text-sm text-ink-3">加载中…</main>
      }
    >
      <StudioInner />
    </Suspense>
  );
}
