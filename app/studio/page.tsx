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

const MOTION_LABEL: Record<Recipe["motion"], string> = {
  spiral: "螺旋",
  burst: "迸发",
  orbit: "轨道",
  flow: "流动",
};

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

  const forkItem = fork ? getSquareItem(fork) : undefined;

  // 广场二创：进入页面即复制一份配方到“我的万花筒”
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

  // Agent 产出新配方：创建或保存新版本
  const handleApply = (recipe: Recipe, name?: string) => {
    const now = Date.now();
    if (activeId) {
      const cur = getEffect(activeId);
      if (cur) {
        // 配方未变化（如二创初始化回放）时不 bump 版本
        const unchanged = JSON.stringify(cur.recipe) === JSON.stringify(recipe);
        upsertEffect({
          ...cur,
          recipe,
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
      name: name ?? "未命名万花筒",
      prompt: prompt ?? "",
      recipe,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    setCreatedId(newId);
  };

  const share = () => {
    if (!effect) return;
    upsertEffect({ ...effect, shared: true });
    setToast("已分享到万花筒广场（Mock，接入后端后生效）");
    setTimeout(() => setToast(""), 3000);
  };

  const seed = useMemo(
    () => hashString(activeId ?? prompt ?? "preview"),
    [activeId, prompt],
  );
  const recipe = effect?.recipe ?? defaultRecipe("kaleido-preview");

  const notFound = hydrated && ((!!id && !effect) || (!!fork && !forkItem));
  if (notFound) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-ink-2">没有找到这个万花筒，可能已被删除。</p>
        <Link href="/mine" className="text-sm text-bili-pink hover:underline">
          返回我的万花筒 →
        </Link>
      </main>
    );
  }

  const chatKey = prompt ?? activeId ?? "blank";

  return (
    <main className="flex min-h-0 flex-1 flex-col lg:h-[calc(100vh-3.5rem)] lg:flex-row">
      {/* 左：对话 */}
      <div className="flex h-[480px] flex-none flex-col border-b border-line bg-card lg:h-auto lg:w-[400px] lg:border-r lg:border-b-0">
        <AgentChat
          key={chatKey}
          recipe={effect?.recipe ?? null}
          autoPrompt={prompt ?? (forkItem ? forkItem.prompt : undefined)}
          creationName={forkItem ? `${forkItem.name} · 二创` : undefined}
          creationRecipe={forkItem?.recipe}
          intro={
            !prompt && !forkItem && effect
              ? `已加载「${effect.name}」（当前 v${effect.version}）。\n\n原始需求：「${effect.prompt}」\n\n直接告诉我你想怎么调整，比如「碎片再多一点」「换成蓝色系」。`
              : undefined
          }
          onApply={handleApply}
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

          {/* 播放器预览 */}
          <KaleidoPlayer recipe={recipe} seed={seed} title={effect?.name ?? "万花筒预览"} />

          {/* 配方参数 */}
          <div className="rounded-xl border border-line bg-card p-4">
            <p className="mb-3 text-xs font-semibold tracking-wider text-ink-3">当前配方 RECIPE</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md bg-fill px-2.5 py-1 text-ink-2">
                对称 <b className="text-ink">{recipe.symmetry}</b>
              </span>
              <span className="rounded-md bg-fill px-2.5 py-1 text-ink-2">
                运动 <b className="text-ink">{MOTION_LABEL[recipe.motion]}</b>
              </span>
              <span className="rounded-md bg-fill px-2.5 py-1 text-ink-2">
                旋转 <b className="text-ink">{recipe.rotationSpeed.toFixed(2)}</b> 圈/秒
              </span>
              <span className="rounded-md bg-fill px-2.5 py-1 text-ink-2">
                拖影 <b className="text-ink">{recipe.trail.toFixed(2)}</b>
              </span>
              <span className="rounded-md bg-fill px-2.5 py-1 text-ink-2">
                密度 <b className="text-ink">{recipe.density.toFixed(1)}x</b>
              </span>
              <span className="flex items-center gap-1.5 rounded-md bg-fill px-2.5 py-1 text-ink-2">
                配色
                {recipe.palette.map((c) => (
                  <i
                    key={c}
                    className="h-3.5 w-3.5 rounded-full border border-black/10"
                    style={{ background: c }}
                  />
                ))}
              </span>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-ink-3">
              预览使用 Mock 弹幕数据（点播 240 条 / 直播 160 条，固定种子可复现），接入后端后替换为真实弹幕流。
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
