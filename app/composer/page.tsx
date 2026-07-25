"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { apiFetch, ApiError } from "@/lib/api";
import { defaultRecipe } from "@/lib/recipes";
import { DEFAULT_EFFECT_SOURCE } from "@/lib/runtime/effect";
import {
  fetchEffectSource,
  resolveEffectRecipe,
  type ResolvedEffectSource,
} from "@/lib/effect-source";
import type { ComposerEffectsResponse, ComposerMode, EffectDto } from "@/types";
import {
  ComposerPlayer,
  type ComposerPlayerHandle,
} from "@/components/composer/composer-player";
import {
  ComposerTimeline,
  MIN_CLIP_MS,
  type ComposerClip,
} from "@/components/composer/timeline";
import { EffectThumb } from "@/components/effect-thumb";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";

const INSERT_DEFAULT_MS = 5000;

/**
 * 视频编排（Demo）：把用户名下的万花筒铺到演示视频的时间轴上，
 * 片段范围内弹幕才触发对应特效；同一时刻只允许一种万花筒（不支持叠加）。
 */
export default function ComposerPage() {
  const { user, loading: sessionLoading } = useSession();

  const [effects, setEffects] = useState<EffectDto[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<ComposerMode>("video");
  const [clips, setClips] = useState<ComposerClip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hint, setHint] = useState("");

  const playerRef = useRef<ComposerPlayerHandle>(null);
  const clipSeq = useRef(0);
  const currentMsRef = useRef(0);

  /* ---------- 拉取用户名下全部万花筒 ---------- */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch<ComposerEffectsResponse>("/api/composer/effects")
      .then(({ effects: list }) => {
        if (!cancelled) setEffects(list);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof ApiError ? e.message : "加载万花筒失败");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  /* ---------- 解析每个万花筒的真实可运行源码（版本产物 → 草稿入口 → 默认引擎） ---------- */
  const [sources, setSources] = useState<Map<number, ResolvedEffectSource>>(new Map());
  useEffect(() => {
    if (!effects) return;
    let cancelled = false;
    void Promise.all(
      effects.map(async (fx) => {
        const resolved = await fetchEffectSource({
          effectId: fx.id,
          recipe: resolveEffectRecipe(fx),
          channel: "draft",
          maybePackaged: Boolean(
            fx.draftVersionId ?? fx.stagingVersionId ?? fx.publishedVersionId,
          ),
        });
        return [fx.id, resolved] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setSources(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [effects]);

  const defaultSource = useMemo<ResolvedEffectSource>(
    () => ({
      source: DEFAULT_EFFECT_SOURCE,
      recipe: defaultRecipe("composer-idle"),
      packaged: false,
    }),
    [],
  );
  const resolveEffect = useCallback(
    (effectId: number) => sources.get(effectId) ?? null,
    [sources],
  );

  const handleTime = useCallback((ms: number) => {
    currentMsRef.current = ms;
    setCurrentMs(ms);
  }, []);

  /* ---------- 片段操作 ---------- */
  const insertClip = useCallback(
    (effectId: number) => {
      if (durationMs <= 0) return;
      const playhead = currentMsRef.current;
      const sorted = [...clips].sort((a, b) => a.startMs - b.startMs);
      // 找到播放头所在的空隙 [gapStart, gapEnd]
      let gapStart = 0;
      let gapEnd = durationMs;
      for (const c of sorted) {
        if (c.endMs <= playhead) {
          gapStart = Math.max(gapStart, c.endMs);
          continue;
        }
        if (c.startMs <= playhead && playhead < c.endMs) {
          // 播放头在片段内：放到该片段之后的空隙
          gapStart = c.endMs;
          continue;
        }
        gapEnd = c.startMs;
        break;
      }
      const start = Math.max(gapStart, Math.min(playhead, gapEnd));
      const end = Math.min(start + INSERT_DEFAULT_MS, gapEnd);
      if (end - start < MIN_CLIP_MS) {
        setHint("当前位置空间不足，移动播放头或先缩短其它片段");
        return;
      }
      setHint("");
      const clip: ComposerClip = {
        id: `clip-${++clipSeq.current}`,
        effectId,
        startMs: Math.round(start),
        endMs: Math.round(end),
      };
      setClips((prev) => [...prev, clip]);
      setSelectedId(clip.id);
    },
    [clips, durationMs],
  );

  const moveClip = useCallback(
    (id: string, startMs: number) => {
      setClips((prev) => {
        const cur = prev.find((c) => c.id === id);
        if (!cur || durationMs <= 0) return prev;
        const len = cur.endMs - cur.startMs;
        const others = prev.filter((c) => c.id !== id).sort((a, b) => a.startMs - b.startMs);
        const before = others.filter((c) => c.startMs < cur.startMs).pop();
        const after = others.find((c) => c.startMs > cur.startMs);
        const lo = before ? before.endMs : 0;
        const hi = after ? after.startMs : durationMs;
        if (hi - lo < len) return prev;
        const s = Math.min(Math.max(startMs, lo), hi - len);
        if (Math.round(s) === cur.startMs) return prev;
        return prev.map((c) =>
          c.id === id
            ? { ...c, startMs: Math.round(s), endMs: Math.round(s + len) }
            : c,
        );
      });
    },
    [durationMs],
  );

  const resizeClip = useCallback(
    (id: string, edge: "start" | "end", ms: number) => {
      setClips((prev) => {
        const cur = prev.find((c) => c.id === id);
        if (!cur || durationMs <= 0) return prev;
        const others = prev.filter((c) => c.id !== id).sort((a, b) => a.startMs - b.startMs);
        const before = others.filter((c) => c.startMs < cur.startMs).pop();
        const after = others.find((c) => c.startMs > cur.startMs);
        const lo = before ? before.endMs : 0;
        const hi = after ? after.startMs : durationMs;
        let s = cur.startMs;
        let e = cur.endMs;
        if (edge === "start") s = Math.min(Math.max(ms, lo), e - MIN_CLIP_MS);
        else e = Math.max(Math.min(ms, hi), s + MIN_CLIP_MS);
        if (Math.round(s) === cur.startMs && Math.round(e) === cur.endMs) return prev;
        return prev.map((c) =>
          c.id === id ? { ...c, startMs: Math.round(s), endMs: Math.round(e) } : c,
        );
      });
    },
    [durationMs],
  );

  const deleteClip = useCallback((id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  /* ---------- 快捷键：空格播放 / 方向键跳转 / Delete 删除片段 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        playerRef.current?.togglePlay();
      } else if (e.key === "ArrowLeft") {
        playerRef.current?.seek(currentMsRef.current - 5000);
      } else if (e.key === "ArrowRight") {
        playerRef.current?.seek(currentMsRef.current + 5000);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteClip(selectedId);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, deleteClip]);

  const activeEffectName = useMemo(() => {
    if (!activeClipId) return null;
    const clip = clips.find((c) => c.id === activeClipId);
    if (!clip) return null;
    return effects?.find((fx) => fx.id === clip.effectId)?.name ?? `#${clip.effectId}`;
  }, [activeClipId, clips, effects]);

  /* ---------- 会话态 ---------- */
  if (sessionLoading) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-6 py-20">
        <Spinner />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-card py-20">
          <p className="text-sm text-ink-2">视频编排需要使用你名下的万花筒，请先登录</p>
          <Link
            href={`/login?next=${encodeURIComponent("/composer")}`}
            className="rounded-lg bg-bili-pink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bili-pink-hover"
          >
            去登录 →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">视频编排</h1>
          <p className="mt-1 text-sm text-ink-2">
            Demo 演示：把万花筒铺到时间轴上，片段范围内弹幕才会触发特效；同一时刻只能有一种万花筒。
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-line text-sm">
          {(["video", "live"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-4 py-1.5 transition-colors",
                mode === m
                  ? "bg-bili-blue text-white"
                  : "bg-card text-ink-2 hover:text-ink",
              )}
            >
              {m === "video" ? "视频模式" : "直播模式"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* 素材库：用户名下的全部万花筒 */}
        <aside className="flex max-h-[540px] flex-col rounded-2xl border border-line bg-card p-4">
          <h2 className="text-sm font-semibold text-ink">我的万花筒</h2>
          <p className="mt-0.5 text-xs text-ink-3">点击「插入」铺到播放头位置</p>
          {loadError && <p className="mt-3 text-xs text-error">{loadError}</p>}
          {effects === null ? (
            <div className="flex flex-1 items-center justify-center py-10">
              <Spinner size={20} />
            </div>
          ) : effects.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
              <p className="text-xs text-ink-3">还没有万花筒作品</p>
              <Link href="/" className="text-xs font-medium text-bili-pink hover:underline">
                去创建 →
              </Link>
            </div>
          ) : (
            <ul className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
              {effects.map((fx) => (
                <li
                  key={fx.id}
                  className="flex items-center gap-2.5 rounded-xl border border-line p-2 transition-colors hover:border-bili-pink/40"
                >
                  <div className="w-20 flex-none overflow-hidden rounded-lg">
                    <EffectThumb
                      recipe={sources.get(fx.id)?.recipe ?? resolveEffectRecipe(fx)}
                      seedText={String(fx.id)}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink" title={fx.name}>
                      {fx.name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-3">
                      {fx.visibility === "public" ? "已公开" : "私有"}
                    </p>
                  </div>
                  <button
                    onClick={() => insertClip(fx.id)}
                    className="flex-none rounded-md bg-bili-pink px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-bili-pink-hover"
                  >
                    插入
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* 播放器 */}
        <div className="min-w-0">
          <ComposerPlayer
            ref={playerRef}
            mode={mode}
            seed={user.id}
            clips={clips}
            defaultSource={defaultSource}
            resolveEffect={resolveEffect}
            onTime={handleTime}
            onDuration={setDurationMs}
            onPlayingChange={setPlaying}
            onActiveClipChange={setActiveClipId}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-ink-3">
            <span>
              {mode === "video"
                ? "视频模式：一次性返回全部弹幕，播完即止"
                : "直播模式：弹幕实时推送，视频循环播放"}
            </span>
            <span className={cn(activeEffectName ? "text-bili-pink" : "")}>
              {activeEffectName ? `当前生效：${activeEffectName}` : "当前为经典默认弹幕"}
            </span>
          </div>
        </div>
      </div>

      {hint && <p className="mt-4 text-xs text-warning">{hint}</p>}

      {/* 时间轴 */}
      <div className="mt-4">
        <ComposerTimeline
          durationMs={durationMs}
          currentMs={currentMs}
          playing={playing}
          clips={clips}
          effects={effects ?? []}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSeek={(ms) => playerRef.current?.seek(ms)}
          onMove={moveClip}
          onResize={resizeClip}
          onDelete={deleteClip}
        />
      </div>
    </main>
  );
}
