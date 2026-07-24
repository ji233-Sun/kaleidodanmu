"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Recipe } from "@/lib/types";
import { defaultRecipe } from "@/lib/recipes";
import {
  getEffect,
  getEffectsServerSnapshot,
  getEffectsSnapshot,
  newEffectId,
  subscribeEffects,
  upsertEffect,
} from "@/lib/store";
import { getSquareItem } from "@/lib/square";
import { hashString } from "@/lib/random";
import { AgentChat } from "@/components/studio/agent-chat";
import { CloudPanel } from "@/components/studio/cloud-panel";
import { KaleidoPlayer } from "@/components/player/kaleido-player";
import { cn } from "@/lib/cn";

function StudioInner() {
  const params = useSearchParams();
  const prompt = params.get("prompt") ?? undefined;
  const id = params.get("id");
  const fork = params.get("fork");

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
  const initialId = id ?? forkId;
  const [createdId, setCreatedId] = useState<string | null>(null);
  const forkCreatedRef = useRef(false);
  const [toast, setToast] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [effectError, setEffectError] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<string | null>(null);
  const [danmakuMode, setDanmakuMode] = useState<"live" | "vod">("vod");
  const [danmakuIntent, setDanmakuIntent] = useState("");

  const forkItem = fork ? getSquareItem(fork) : undefined;

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

  // 刷新恢复：同一 prompt 的创作会话认领本地已生成的作品，
  // 避免刷新后作品变孤儿（预览回退默认配方、再次生成重复作品）。
  const adoptedId = useMemo(() => {
    if (!prompt || id || fork) return null;
    return effects.find((e) => e.prompt === prompt)?.id ?? null;
  }, [effects, prompt, id, fork]);

  const activeId = createdId ?? initialId ?? adoptedId;
  const effect = activeId ? (effects.find((e) => e.id === activeId) ?? null) : null;

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
  };

  const share = () => {
    if (!effect) return;
    upsertEffect({ ...effect, shared: true });
    setToast("已分享到创作广场（Mock，接入后端后生效）");
    setTimeout(() => setToast(""), 3000);
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

  const notFound = hydrated && ((!!id && !effect) || (!!fork && !forkItem));
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

  const chatKey = prompt ?? activeId ?? "blank";
  // 会话同步键：prompt 键与作品 id 键双写，换入口后仍能恢复历史
  const aliasKeys = [
    ...(activeId && activeId !== chatKey ? [activeId] : []),
    ...(effect?.prompt && effect.prompt !== chatKey ? [effect.prompt] : []),
  ];

  const askAgentToFix = () => {
    if (!effectError) return;
    setOutbox(
      `预览运行时出错：${effectError}。请读取 index.ts 检查并修复这个问题，然后重新校验并刷新预览。`,
    );
  };

  const applyDanmakuIntent = () => {
    const intent = danmakuIntent.trim();
    if (!intent) return;
    setOutbox(
      `${danmakuMode === "live" ? "以直播弹幕为语境" : "以点播时间线为语境"}，请把弹幕编排成：${intent}。保留现有画面风格，并让弹幕成为主要视觉反馈。`,
    );
    setDanmakuIntent("");
  };

  return (
    <main className="flex h-[calc(100dvh-5.25rem)] min-h-0 flex-col overflow-hidden sm:h-[calc(100dvh-3.5rem)] lg:flex-row">
      {/* 左：对话 */}
      <div className="flex h-1/2 min-h-0 flex-none flex-col overflow-hidden border-b border-line bg-card lg:h-auto lg:w-[400px] lg:border-r lg:border-b-0">
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
          ) : (
            <KaleidoPlayer
              recipe={recipe}
              effectSource={effect?.entrySource}
              seed={seed}
              title={effect?.name ?? "Canvas 预览"}
              onEffectError={setEffectError}
            />
          )}

          <section className="rounded-xl border border-line bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-wider text-bili-pink">弹幕编排</p>
                <h2 className="mt-1 text-base font-semibold text-ink">先定义弹幕如何出现，再让 Canvas 回应它</h2>
              </div>
              <div className="flex rounded-lg bg-fill p-1 text-xs">
                {(["vod", "live"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setDanmakuMode(mode)}
                    className={cn(
                      "rounded-md px-3 py-1.5 transition-colors",
                      danmakuMode === mode ? "bg-card font-medium text-bili-pink shadow-sm" : "text-ink-3 hover:text-ink-2",
                    )}
                  >
                    {mode === "vod" ? "点播时间线" : "直播现场"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                value={danmakuIntent}
                onChange={(e) => setDanmakuIntent(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyDanmakuIntent()}
                placeholder="例如：高赞弹幕聚成一条光带，争议弹幕分裂成两侧"
                className="h-10 rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-bili-pink"
              />
              <button
                onClick={applyDanmakuIntent}
                disabled={!danmakuIntent.trim() || agentBusy}
                className="h-10 rounded-lg bg-bili-pink px-4 text-sm font-medium text-white transition-colors hover:bg-bili-pink-hover disabled:opacity-40"
              >
                交给 Agent 编排
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-3">
              <span className="rounded-full bg-bili-pink-light px-2.5 py-1 text-bili-pink">弹幕密度 {Math.round(recipe.density * 100)}%</span>
              <span className="rounded-full bg-bili-blue-light px-2.5 py-1 text-bili-blue">{recipe.symmetry} 条视觉轨道</span>
              <span className="rounded-full bg-bili-purple-light px-2.5 py-1 text-bili-purple">{recipe.motion} 运动响应</span>
              <span className="rounded-full border border-line px-2.5 py-1">{danmakuMode === "live" ? "实时消息流" : "按时间触发"}</span>
            </div>
          </section>

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
