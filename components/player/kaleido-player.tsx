"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DanmakuEvent, Recipe } from "@/lib/types";
import { generateLiveDanmaku, generateVodDanmaku } from "@/lib/danmaku";
import { DEFAULT_EFFECT_SOURCE } from "@/lib/runtime/effect";
import { EffectSandbox, type EffectSandboxHandle } from "@/components/player/effect-sandbox";
import { cn } from "@/lib/cn";

const SPEEDS = [2, 1.5, 1.25, 1, 0.75, 0.5];
const LANES = 8;

function fmt(s: number) {
  if (!isFinite(s)) s = 0;
  s = Math.floor(s);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function KaleidoPlayer({
  recipe,
  effectSource = DEFAULT_EFFECT_SOURCE,
  seed = 42,
  title = "【演示】自由 Canvas · 概念视频",
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
  const dmLayerRef = useRef<HTMLDivElement>(null);
  const laneBusyRef = useRef<number[]>(new Array(LANES).fill(0));
  const vodIdxRef = useRef(0);
  const vodLastRef = useRef(0);
  const liveClockRef = useRef(0);
  const liveIdxRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [dmOn, setDmOn] = useState(true);
  const [source, setSource] = useState<"vod" | "live">("vod");
  const [fps, setFps] = useState(0);
  const [effectError, setEffectError] = useState<string | null>(null);

  // 运行错误同步给外层（Studio 用它做显著提示与「让 Agent 修复」入口）
  useEffect(() => {
    onEffectError?.(effectError);
  }, [effectError, onEffectError]);

  const vodEvents = useMemo(() => generateVodDanmaku(seed, 60_000, 240), [seed]);
  const liveEvents = useMemo(() => generateLiveDanmaku(seed), [seed]);

  /* ---------- danmaku emission ---------- */
  const fireClassic = useCallback((ev: DanmakuEvent) => {
    const layer = dmLayerRef.current;
    const video = videoRef.current;
    if (!layer || !video) return;
    const now = performance.now();
    let lane = -1;
    for (let i = 0; i < LANES; i++) {
      if (laneBusyRef.current[i] < now) {
        lane = i;
        break;
      }
    }
    if (lane === -1) lane = Math.floor(Math.random() * LANES);
    laneBusyRef.current[lane] = now + 1200;

    const el = document.createElement("div");
    el.textContent = ev.text;
    el.className =
      "absolute left-full whitespace-nowrap font-bold will-change-transform pointer-events-none";
    el.style.top = `${(lane / LANES) * 86 + 2}%`;
    el.style.fontSize = `${ev.fontSize}px`;
    el.style.color = "#" + ev.color.toString(16).padStart(6, "0");
    el.style.textShadow = "0 0 4px rgba(0,0,0,.8)";
    layer.appendChild(el);

    const maxVisible = layer.clientWidth < 480 ? 10 : 24;
    while (layer.childElementCount > maxVisible) layer.firstElementChild?.remove();

    const w = layer.clientWidth;
    const ew = el.offsetWidth;
    const duration = layer.clientWidth < 480 ? 5000 : 7000;
    let start = performance.now();
    let pausedAt: number | null = null;
    const frame = (t: number) => {
      if (!el.isConnected) return;
      if (video.paused) {
        if (pausedAt === null) pausedAt = t;
        requestAnimationFrame(frame);
        return;
      }
      if (pausedAt !== null) {
        start += t - pausedAt;
        pausedAt = null;
      }
      const p = (t - start) / duration;
      if (p >= 1) {
        el.remove();
        return;
      }
      el.style.transform = `translateX(${-(w + ew) * p}px)`;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, []);

  const emit = useCallback(
    (ev: DanmakuEvent) => {
      effectRef.current?.emit(ev);
      fireClassic(ev);
    },
    [fireClassic],
  );

  /* ---------- scheduling loop ---------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let raf = 0;
    let prevTs: number | null = null;
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
          dmLayerRef.current?.replaceChildren();
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
      } else {
        // 直播：虚拟时钟随播放推进，到点推送，到底循环
        if (!v.paused && prevTs !== null) {
          liveClockRef.current += (ts - prevTs) * v.playbackRate;
        }
        const clock = liveClockRef.current;
        const last = liveEvents[liveEvents.length - 1]?.receivedAt ?? 0;
        if (liveIdxRef.current >= liveEvents.length) {
          liveClockRef.current = 0;
          liveIdxRef.current = 0;
        } else {
          while (
            liveIdxRef.current < liveEvents.length &&
            liveEvents[liveIdxRef.current].receivedAt <= clock
          ) {
            emit(liveEvents[liveIdxRef.current]);
            liveIdxRef.current++;
          }
        }
        void last;
      }
      prevTs = ts;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [source, vodEvents, liveEvents, emit]);

  // 切源时清场
  useEffect(() => {
    vodIdxRef.current = 0;
    liveIdxRef.current = 0;
    liveClockRef.current = 0;
    effectRef.current?.reset();
    dmLayerRef.current?.replaceChildren();
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
      <div className="absolute inset-0 z-[5]">
        <EffectSandbox
          ref={effectRef}
          source={effectSource}
          recipe={recipe}
          playing={playing}
          onFps={setFps}
          onError={setEffectError}
        />
      </div>

      {/* 经典弹幕层 */}
      <div
        ref={dmLayerRef}
        className={cn("pointer-events-none absolute inset-0 z-[6] overflow-hidden", !dmOn && "hidden")}
      />

      {/* 顶栏 */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-[8] bg-gradient-to-b from-black/75 to-transparent px-4 pt-3 pb-8 text-sm text-white transition-opacity",
          showUI ? "opacity-100" : "opacity-0",
        )}
      >
        {title}
      </div>

      {/* FPS + 数据源徽标 */}
      <div
        className={cn(
          "absolute top-3 right-3 z-[8] flex items-center gap-2 transition-opacity",
          showUI ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="rounded-full border border-white/20 bg-black/50 px-2.5 py-0.5 text-xs text-white/85">
          {fps} FPS
        </span>
        <span className="rounded-full border border-white/20 bg-black/50 px-2.5 py-0.5 text-xs text-bili-blue">
          {source === "vod" ? "点播 Mock" : "直播 Mock"}
        </span>
        {effectError && (
          <span className="max-w-52 truncate rounded-full border border-red-300/40 bg-red-950/70 px-2.5 py-0.5 text-xs text-red-200" title={effectError}>
            Effect 运行错误
          </span>
        )}
      </div>

      {/* 暂停大图标 */}
      {!playing && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-[7] flex h-18 w-18 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/45">
          <svg viewBox="0 0 24 24" className="h-8 w-8 fill-white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      )}

      {/* 控制条 */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-[10] bg-gradient-to-t from-black/85 via-black/60 to-transparent px-3 pb-2 transition-opacity",
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

          {/* 弹幕开关 */}
          <button
            onClick={() => setDmOn((v) => !v)}
            className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-white transition-colors hover:bg-white/12"
            title="经典弹幕层开关"
          >
            弹幕
            <span
              className={cn(
                "relative h-4.5 w-8 rounded-full transition-colors",
                dmOn ? "bg-bili-blue" : "bg-white/30",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform",
                  dmOn && "translate-x-3.5",
                )}
              />
            </span>
          </button>

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
