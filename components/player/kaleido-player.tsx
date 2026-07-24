"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DanmakuEvent, Recipe } from "@/lib/types";
import { liveFrameToEvent, vodElemToEvent } from "@/lib/danmaku";
import type { LiveFrame, VodDanmakuReply } from "@/types";
import { DEFAULT_EFFECT_SOURCE } from "@/lib/runtime/effect";
import { EffectSandbox, type EffectSandboxHandle } from "@/components/player/effect-sandbox";
import { cn } from "@/lib/cn";

const SPEEDS = [2, 1.5, 1.25, 1, 0.75, 0.5];

function fmt(s: number) {
  if (!isFinite(s)) s = 0;
  s = Math.floor(s);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function KaleidoPlayer({
  recipe,
  effectSource = DEFAULT_EFFECT_SOURCE,
  seed = 42,
  title = "【演示】Kaleido Danmu · 概念视频",
  autoPlay = true,
  onEffectError,
}: {
  recipe: Recipe;
  effectSource?: string;
  seed?: number;
  title?: string;
  autoPlay?: boolean;
  onEffectError?: (message: string | null) => void;
}) {
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const effectRef = useRef<EffectSandboxHandle>(null);
  const vodIdxRef = useRef(0);
  const vodLastRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [source, setSource] = useState<"vod" | "live">("vod");
  const [showDanmakuList, setShowDanmakuList] = useState(false);
  const [fps, setFps] = useState(0);
  const [effectError, setEffectError] = useState<string | null>(null);
  const [vodEvents, setVodEvents] = useState<DanmakuEvent[]>([]);
  const [vodState, setVodState] = useState<"loading" | "ready" | "error">("loading");
  const [liveState, setLiveState] = useState<"loading" | "ready" | "error">("loading");

  // 运行错误同步给外层（Studio 用它做显著提示与「让 Agent 修复」入口）
  useEffect(() => {
    onEffectError?.(effectError);
  }, [effectError, onEffectError]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => setVodState("loading"));
    void fetch(`/api/mock/vod?seed=${seed}&count=240&duration=60000`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<VodDanmakuReply>;
      })
      .then(({ elems }) => {
        setVodEvents(elems.map(vodElemToEvent));
        setVodState("ready");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setVodState("error");
      });
    return () => controller.abort();
  }, [seed]);

  useEffect(() => {
    if (source !== "live") return;
    void Promise.resolve().then(() => setLiveState("loading"));
    const stream = new EventSource(`/api/mock/live?seed=${seed}&rate=2`);
    stream.onopen = () => setLiveState("ready");
    stream.onerror = () => setLiveState("error");
    stream.onmessage = (message) => {
      try {
        const event = liveFrameToEvent(JSON.parse(message.data) as LiveFrame);
        if (event) effectRef.current?.emit(event);
      } catch {
        // Ignore malformed mock frames and keep the stream alive.
      }
    };
    return () => stream.close();
  }, [seed, source]);

  /* ---------- danmaku emission ---------- */
  // 弹幕统一交给特效层渲染，不再叠加经典原文弹幕
  const emit = useCallback((ev: DanmakuEvent) => {
    effectRef.current?.emit(ev);
  }, []);

  /* ---------- scheduling loop ---------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let raf = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const v = videoRef.current;
      if (!v) return;
      if (source === "vod") {
        const nowMs = v.currentTime * 1000;
        const last = vodLastRef.current;
        if (nowMs < last) {
          // seek 回退或循环：按时间线重放
          vodIdxRef.current = 0;
          effectRef.current?.reset();
        } else if (!v.paused) {
          while (
            vodIdxRef.current < vodEvents.length &&
            (vodEvents[vodIdxRef.current].videoTimeMs ?? 0) <= nowMs
          ) {
            emit(vodEvents[vodIdxRef.current]);
            vodIdxRef.current++;
          }
        }
        vodLastRef.current = nowMs;
      }
      void ts;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [source, vodEvents, emit]);

  // 切源时清场
  useEffect(() => {
    vodIdxRef.current = 0;
    effectRef.current?.reset();
  }, [source]);

  /* ---------- video events ---------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      setCur(video.currentTime);
      if (video.duration) setDur(video.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onTime);
    video.addEventListener("loadedmetadata", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    if (autoPlay) video.play().catch(() => {});
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onTime);
      video.removeEventListener("loadedmetadata", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [autoPlay]);

  /* ---------- controls ---------- */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const wakeUI = useCallback(() => {
    setShowUI(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) setShowUI(false);
    }, 2600);
  }, []);

  const seek = useCallback((clientX: number, el: HTMLDivElement) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    v.currentTime = x * v.duration;
  }, []);

  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else playerRef.current?.requestFullscreen?.();
  }, []);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const v = videoRef.current;
      if (!v) return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        v.currentTime = Math.max(0, v.currentTime - 5);
        wakeUI();
      } else if (e.key === "ArrowRight") {
        v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
        wakeUI();
      } else if (e.key === "f" || e.key === "F") {
        toggleFs();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleFs, wakeUI]);

  const pct = dur ? Math.min(100, (cur / dur) * 100) : 0;
  const sourceState = source === "vod" ? vodState : liveState;
  const currentMs = cur * 1000;
  const visibleVodEvents = vodEvents.filter((event) => {
    const at = event.videoTimeMs ?? 0;
    return at >= Math.max(0, currentMs - 5000) && at <= currentMs + 15000;
  }).slice(0, 30);

  return (
    <div
      ref={playerRef}
      onMouseMove={wakeUI}
      onMouseLeave={() => playing && setShowUI(false)}
      className={cn(
        "group relative aspect-video w-full select-none overflow-hidden rounded-xl bg-black shadow-2xl",
        "fullscreen:rounded-none",
      )}
    >
      <video
        ref={videoRef}
        src="/demo-loop.mp4"
        loop
        playsInline
        preload="auto"
        onClick={togglePlay}
        onDoubleClick={toggleFs}
        className="absolute inset-0 h-full w-full object-contain"
      />

      {/* 隔离的 Canvas / WebGL Effect 层 */}
      <div className="absolute inset-0 z-5">
        <EffectSandbox
          ref={effectRef}
          source={effectSource}
          recipe={recipe}
          playing={playing}
          onFps={setFps}
          onError={setEffectError}
        />
      </div>

      {showDanmakuList && source === "vod" && (
        <aside className="absolute top-12 right-3 bottom-16 z-9 w-64 overflow-hidden rounded-lg border border-white/15 bg-black/80 text-white shadow-xl">
          <div className="flex items-center border-b border-white/10 px-3 py-2">
            <span className="text-xs font-medium">VOD 弹幕时间轴</span>
            <span className="ml-auto text-[10px] text-white/50">{vodEvents.length} 条</span>
          </div>
          <div className="h-full overflow-y-auto pb-10">
            {visibleVodEvents.map((event) => {
              const at = (event.videoTimeMs ?? 0) / 1000;
              const active = Math.abs(at - cur) < 1;
              return (
                <button
                  key={event.id}
                  onClick={() => { if (videoRef.current) videoRef.current.currentTime = at; }}
                  className={cn(
                    "grid w-full grid-cols-[38px_1fr] gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/10",
                    active && "bg-bili-blue/25",
                  )}
                >
                  <span className="text-white/45 tabular-nums">{fmt(at)}</span>
                  <span className="truncate" title={event.text}>{event.text}</span>
                </button>
              );
            })}
            {visibleVodEvents.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-white/45">当前时间附近没有弹幕</p>
            )}
          </div>
        </aside>
      )}

      {/* 顶栏 */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-8 bg-linear-to-b from-black/75 to-transparent px-4 pt-3 pb-8 text-sm text-white transition-opacity",
          showUI ? "opacity-100" : "opacity-0",
        )}
      >
        {title}
      </div>

      {/* FPS + 数据源徽标 */}
      <div
        className={cn(
          "absolute top-3 right-3 z-8 flex items-center gap-2 transition-opacity",
          showUI ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="rounded-full border border-white/20 bg-black/50 px-2.5 py-0.5 text-xs text-white/85">
          {fps} FPS
        </span>
        <span className="rounded-full border border-white/20 bg-black/50 px-2.5 py-0.5 text-xs text-bili-blue">
          {source === "vod" ? `VOD API · ${vodEvents.length} 条` : "LIVE SSE"}
          {sourceState === "loading" ? " · 连接中" : sourceState === "error" ? " · 异常" : ""}
        </span>
        {effectError && (
          <span className="max-w-52 truncate rounded-full border border-red-300/40 bg-red-950/70 px-2.5 py-0.5 text-xs text-red-200" title={effectError}>
            Effect 运行错误
          </span>
        )}
      </div>

      {/* 暂停大图标 */}
      {!playing && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-7 flex h-18 w-18 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/45">
          <svg viewBox="0 0 24 24" className="h-8 w-8 fill-white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      )}

      {/* 控制条 */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/85 via-black/60 to-transparent px-3 pb-2 transition-opacity",
          showUI ? "opacity-100" : "opacity-0",
        )}
      >
        {/* 进度条 */}
        <div
          className="group/bar flex h-4 cursor-pointer items-center"
          onPointerDown={(e) => {
            seek(e.clientX, e.currentTarget);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) seek(e.clientX, e.currentTarget);
          }}
        >
          <div className="relative h-1 w-full rounded-full bg-white/25 transition-all group-hover/bar:h-1.5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-bili-blue" style={{ width: `${pct}%` }} />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bili-blue shadow"
              style={{ left: `${pct}%` }}
            />
          </div>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          <button
            onClick={togglePlay}
            title="播放/暂停 (空格)"
            className="flex h-8 w-8 items-center justify-center rounded-md text-white transition-colors hover:bg-white/12"
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <span className="hidden px-1 text-xs text-white/90 tabular-nums sm:inline">
            {fmt(cur)}
            <span className="mx-0.5 text-white/50">/</span>
            {fmt(dur)}
          </span>

          {/* 数据源切换 */}
          <div className="ml-1 flex overflow-hidden rounded-md border border-white/20 text-xs">
            {(["vod", "live"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={cn(
                  "px-2 py-1 transition-colors",
                  source === s ? "bg-bili-blue text-white" : "bg-black/30 text-white/70 hover:text-white",
                )}
              >
                {s === "vod" ? "点播" : "直播"}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {source === "vod" && (
            <button
              onClick={() => setShowDanmakuList((value) => !value)}
              className={cn(
                "h-8 rounded-md px-2 text-xs text-white transition-colors hover:bg-white/12",
                showDanmakuList && "bg-white/12 text-bili-blue",
              )}
              title="查看 VOD 接口返回的弹幕列表"
            >
              弹幕列表
            </button>
          )}

          {/* 倍速 */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSpeedOpen((v) => !v);
              }}
              className="h-8 min-w-12 rounded-md px-1.5 text-xs text-white transition-colors hover:bg-white/12"
            >
              {speed}x
            </button>
            {speedOpen && (
              <div className="absolute bottom-10 left-1/2 z-20 flex w-18 -translate-x-1/2 flex-col rounded-lg bg-[#14161a]/95 py-1 shadow-xl">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSpeed(s);
                      if (videoRef.current) videoRef.current.playbackRate = s;
                      setSpeedOpen(false);
                    }}
                    className={cn(
                      "py-1.5 text-xs text-white/85 transition-colors hover:bg-white/10 hover:text-bili-blue",
                      s === speed && "font-bold text-bili-blue",
                    )}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 音量 */}
          <div className="group/vol hidden items-center sm:flex">
            <button
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                v.muted = !v.muted;
                setMuted(v.muted);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-md text-white transition-colors hover:bg-white/12"
              title="静音"
            >
              {muted || volume === 0 ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              )}
            </button>
            <div className="w-0 overflow-hidden transition-all group-hover/vol:w-16">
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : Math.round(volume * 100)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const v = videoRef.current;
                  if (!v) return;
                  v.volume = val / 100;
                  v.muted = val === 0;
                  setVolume(val / 100);
                  setMuted(val === 0);
                }}
                className="w-14 accent-bili-blue"
              />
            </div>
          </div>

          {/* 全屏 */}
          <button
            onClick={toggleFs}
            title="全屏 (F)"
            className="flex h-8 w-8 items-center justify-center rounded-md text-white transition-colors hover:bg-white/12"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
