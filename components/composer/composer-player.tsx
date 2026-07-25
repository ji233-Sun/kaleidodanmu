"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { DanmakuEvent } from "@/lib/types";
import { liveFrameToEvent, vodElemToEvent } from "@/lib/danmaku";
import type { ResolvedEffectSource } from "@/lib/effect-source";
import {
  EffectSandbox,
  type EffectSandboxHandle,
} from "@/components/player/effect-sandbox";
import {
  ClassicDanmakuLayer,
  type ClassicDanmakuHandle,
} from "@/components/player/classic-danmaku-layer";
import type { ComposerMode, ComposerVideoDanmakuResponse } from "@/types";
import type { ComposerClip } from "./timeline";
import { cn } from "@/lib/cn";

const COMPOSER_DEMO_VIDEO =
  "https://kdanmu.pvzflare.com/composer-demo.mp4";

export interface ComposerPlayerHandle {
  seek(ms: number): void;
  togglePlay(): void;
}

interface ComposerPlayerProps {
  mode: ComposerMode;
  seed: number;
  clips: ComposerClip[];
  /** 直播模式下选中的万花筒（实时生效）；null 表示使用经典默认弹幕。 */
  liveEffectId: number | null;
  /** 无生效片段时沙箱的占位形态（此时弹幕走经典弹幕层，不发射进沙箱）。 */
  defaultSource: ResolvedEffectSource;
  /** 解析片段上万花筒的真实可运行形态；尚未加载完成时返回 null。 */
  resolveEffect(effectId: number): ResolvedEffectSource | null;
  onTime(ms: number): void;
  onDuration(ms: number): void;
  onPlayingChange(playing: boolean): void;
  onActiveClipChange(clipId: string | null): void;
}

/**
 * 视频编排播放器：composer-demo 演示视频 + 特效沙箱 + 经典弹幕层。
 * 视频模式一次性拉全量弹幕，待弹幕就绪后才起播、按时间轴调度，片段内弹幕进特效、
 * 片段外走经典弹幕；直播模式走 SSE 实时帧、视频循环播放，选中的万花筒实时生效（未选中则经典弹幕）。
 */
export const ComposerPlayer = forwardRef<ComposerPlayerHandle, ComposerPlayerProps>(
  function ComposerPlayer(
    {
      mode,
      seed,
      clips,
      liveEffectId,
      defaultSource,
      resolveEffect,
      onTime,
      onDuration,
      onPlayingChange,
      onActiveClipChange,
    },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const sandboxRef = useRef<EffectSandboxHandle>(null);
    const classicRef = useRef<ClassicDanmakuHandle>(null);

    const [playing, setPlaying] = useState(false);
    /** 视频缓冲中（含初始加载）：两层弹幕都冻结，严格跟随视频帧。 */
    const [buffering, setBuffering] = useState(true);
    const bufferingRef = useRef(true);
    const [durMs, setDurMs] = useState(0);
    const [fps, setFps] = useState(0);
    const [effectError, setEffectError] = useState<string | null>(null);
    const [vodState, setVodState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [liveState, setLiveState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [vodCount, setVodCount] = useState(0);
    const [activeSource, setActiveSource] = useState<ResolvedEffectSource>(defaultSource);
    /** 特效层是否生效（片段内 / 直播选中万花筒）；片段外冻结，防止自主生成实体的特效持续产生残留。 */
    const [sandboxActive, setSandboxActive] = useState(false);

    // rAF 循环里用的最新引用，避免反复重建循环
    const clipsRef = useRef(clips);
    clipsRef.current = clips;
    const modeRef = useRef(mode);
    modeRef.current = mode;
    const resolveRef = useRef(resolveEffect);
    resolveRef.current = resolveEffect;
    const onTimeRef = useRef(onTime);
    onTimeRef.current = onTime;
    const onActiveClipChangeRef = useRef(onActiveClipChange);
    onActiveClipChangeRef.current = onActiveClipChange;

    const vodEventsRef = useRef<DanmakuEvent[]>([]);
    const vodIdxRef = useRef(0);
    const vodLastRef = useRef(0);
    const activeIdRef = useRef<string | null>(null);
    const lastReportRef = useRef(0);

    const segmentAt = useCallback((ms: number): ComposerClip | null => {
      return clipsRef.current.find((c) => ms >= c.startMs && ms < c.endMs) ?? null;
    }, []);

    /** 片段切换：两层都清场并加载新特效（离开时保留上次的特效，避免多余重载）。 */
    const applySegment = useCallback((seg: ComposerClip | null) => {
      const id = seg?.id ?? null;
      if (id === activeIdRef.current) return;
      activeIdRef.current = id;
      classicRef.current?.reset();
      setSandboxActive(seg !== null);
      onActiveClipChangeRef.current(id);
      if (seg) {
        sandboxRef.current?.reset();
        const resolved = resolveRef.current(seg.effectId);
        if (resolved) setActiveSource(resolved);
      }
    }, []);

    // 离开片段后的清场：子组件 effect 先发 playing:false（同一 MessagePort 顺序送达），
    // 冻结后再 reset，防止带自主生成循环的特效清场后又立刻生成新实体造成残留
    useEffect(() => {
      if (!sandboxActive) sandboxRef.current?.reset();
    }, [sandboxActive]);

    /** 按当前生效目标路由弹幕：true → 特效层，false → 经典默认弹幕。 */
    const emitDanmaku = useCallback((event: DanmakuEvent, useEffect: boolean) => {
      if (useEffect) sandboxRef.current?.emit(event);
      else classicRef.current?.emit(event);
    }, []);

    // 素材源码异步解析完成后，若播放头正停在某个片段上，补一次加载
    useEffect(() => {
      const id = activeIdRef.current;
      if (!id) return;
      const seg = clipsRef.current.find((c) => c.id === id);
      if (!seg) return;
      const resolved = resolveEffect(seg.effectId);
      if (resolved) setActiveSource(resolved);
    }, [resolveEffect]);

    /* ---------- 直播模式：选中的万花筒实时生效，未选中走经典默认弹幕 ---------- */
    const liveResolved =
      mode === "live" && liveEffectId != null ? resolveEffect(liveEffectId) : null;
    const liveEffectRef = useRef<ResolvedEffectSource | null>(null);
    liveEffectRef.current = liveResolved;

    useEffect(() => {
      if (mode !== "live") {
        setSandboxActive(false);
        return;
      }
      // 进入直播或切换选中：清场并加载对应特效；同时清掉视频模式的片段状态
      activeIdRef.current = null;
      sandboxRef.current?.reset();
      classicRef.current?.reset();
      onActiveClipChangeRef.current(null);
      setActiveSource(liveResolved ?? defaultSource);
      setSandboxActive(liveResolved !== null);
    }, [mode, liveResolved, defaultSource]);

    /* ---------- 调度循环 ---------- */
    useEffect(() => {
      let raf = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const v = videoRef.current;
        if (!v) return;
        const nowMs = v.currentTime * 1000;

        if (modeRef.current === "video") {
          const seg = segmentAt(nowMs);
          applySegment(seg);
          const events = vodEventsRef.current;
          const last = vodLastRef.current;
          if (nowMs < last - 100) {
            // 回退跳转或循环：清场后把索引快进到播放头，避免历史弹幕一帧内全量发射
            sandboxRef.current?.reset();
            classicRef.current?.reset();
            vodIdxRef.current = 0;
            while (
              vodIdxRef.current < events.length &&
              (events[vodIdxRef.current].videoTimeMs ?? 0) <= nowMs
            ) {
              vodIdxRef.current++;
            }
          } else if (nowMs > last + 1000) {
            // 前跳：静默快进索引，避免积压弹幕一次性洪峰
            while (
              vodIdxRef.current < events.length &&
              (vodEventsRef.current[vodIdxRef.current].videoTimeMs ?? 0) <= nowMs
            ) {
              vodIdxRef.current++;
            }
          } else if (!v.paused && !bufferingRef.current) {
            while (
              vodIdxRef.current < events.length &&
              (events[vodIdxRef.current].videoTimeMs ?? 0) <= nowMs
            ) {
              emitDanmaku(events[vodIdxRef.current], seg !== null);
              vodIdxRef.current++;
            }
          }
          vodLastRef.current = nowMs;
        }

        // 按绝对差值节流：回拖时 nowMs 变小，差值为负也要及时上报，否则游标停在原地
        if (Math.abs(nowMs - lastReportRef.current) >= 33) {
          lastReportRef.current = nowMs;
          onTimeRef.current(nowMs);
        }
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [applySegment, segmentAt, emitDanmaku]);

    /* ---------- 视频模式：一次性拉取全量弹幕 ---------- */
    useEffect(() => {
      if (mode !== "video" || durMs <= 0) return;
      const controller = new AbortController();
      setVodState("loading");
      vodEventsRef.current = [];
      vodIdxRef.current = 0;
      vodLastRef.current = 0;
      fetch(
        `/api/composer/danmaku?mode=video&seed=${seed}&count=420&durationMs=${Math.round(durMs)}`,
        { signal: controller.signal },
      )
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<ComposerVideoDanmakuResponse>;
        })
        .then(({ elems }) => {
          const events = elems.map(vodElemToEvent);
          vodEventsRef.current = events;
          // 视频可能已被手动起播：静默快进索引到播放头，避免积压弹幕一帧内洪峰补发
          const nowMs = (videoRef.current?.currentTime ?? 0) * 1000;
          let idx = 0;
          while (idx < events.length && (events[idx].videoTimeMs ?? 0) <= nowMs) idx++;
          vodIdxRef.current = idx;
          setVodCount(elems.length);
          setVodState("ready");
        })
        .catch((error: unknown) => {
          if ((error as { name?: string }).name !== "AbortError") setVodState("error");
        });
      return () => controller.abort();
    }, [mode, durMs, seed]);

    /* ---------- 直播模式：SSE 实时帧 ---------- */
    useEffect(() => {
      if (mode !== "live") {
        setLiveState("idle");
        return;
      }
      setLiveState("loading");
      const stream = new EventSource(`/api/composer/danmaku?mode=live&seed=${seed}&rate=3`);
      stream.onopen = () => setLiveState("ready");
      stream.onerror = () => setLiveState("error");
      stream.onmessage = (message) => {
        try {
          const event = liveFrameToEvent(JSON.parse(message.data));
          if (!event) return;
          // 选中了万花筒 → 特效层；未选中 → 经典默认弹幕
          emitDanmaku(event, liveEffectRef.current !== null);
        } catch {
          // 忽略异常帧，保持连接
        }
      };
      return () => stream.close();
    }, [mode, seed, emitDanmaku]);

    /* ---------- 视频元素事件 ---------- */
    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      const onMeta = () => {
        const ms = v.duration * 1000;
        setDurMs(ms);
        onDuration(ms);
      };
      const onPlay = () => {
        setPlaying(true);
        onPlayingChange(true);
      };
      const onPause = () => {
        setPlaying(false);
        onPlayingChange(false);
      };
      const onBufferStart = () => {
        bufferingRef.current = true;
        setBuffering(true);
      };
      const onBufferEnd = () => {
        bufferingRef.current = false;
        setBuffering(false);
      };
      const onEnded = () => {
        sandboxRef.current?.reset();
        classicRef.current?.reset();
      };
      v.addEventListener("loadedmetadata", onMeta);
      v.addEventListener("durationchange", onMeta);
      v.addEventListener("play", onPlay);
      v.addEventListener("pause", onPause);
      v.addEventListener("ended", onEnded);
      v.addEventListener("loadstart", onBufferStart);
      v.addEventListener("waiting", onBufferStart);
      v.addEventListener("playing", onBufferEnd);
      v.addEventListener("canplay", onBufferEnd);
      v.addEventListener("seeked", onBufferEnd);
      // 兜底解冻：真卡顿时 timeupdate 不会触发，视频在走帧则不该处于缓冲态
      v.addEventListener("timeupdate", onBufferEnd);
      return () => {
        v.removeEventListener("loadedmetadata", onMeta);
        v.removeEventListener("durationchange", onMeta);
        v.removeEventListener("play", onPlay);
        v.removeEventListener("pause", onPause);
        v.removeEventListener("ended", onEnded);
        v.removeEventListener("loadstart", onBufferStart);
        v.removeEventListener("waiting", onBufferStart);
        v.removeEventListener("playing", onBufferEnd);
        v.removeEventListener("canplay", onBufferEnd);
        v.removeEventListener("seeked", onBufferEnd);
        v.removeEventListener("timeupdate", onBufferEnd);
      };
    }, [onDuration, onPlayingChange]);

    // 等当前模式的弹幕就绪后才起播（视频模式等全量时间轴拉完，直播等 SSE 连上），
    // 避免边播边加载导致开播段弹幕缺失或迟到弹幕洪峰；加载失败也放行，不让视频永远卡住。
    useEffect(() => {
      const state = mode === "video" ? vodState : liveState;
      if (state === "idle" || state === "loading") return;
      videoRef.current?.play().catch(() => {});
    }, [mode, vodState, liveState]);

    /** 弹幕尚未就绪：强制等待（参考 Studio「Agent 正在生成」的占位形态），加载完成前不允许起播。 */
    const danmakuLoading =
      mode === "video" ? vodState !== "ready" && vodState !== "error" : liveState !== "ready" && liveState !== "error";

    const togglePlay = useCallback(() => {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) {
        if (danmakuLoading) return; // 弹幕未就绪，强制等待
        if (v.ended && modeRef.current === "video") v.currentTime = 0;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    }, [danmakuLoading]);

    useImperativeHandle(ref, () => ({
      seek(ms) {
        const v = videoRef.current;
        if (!v || !isFinite(v.duration)) return;
        v.currentTime = Math.min(Math.max(0, ms / 1000), Math.max(0, v.duration - 0.05));
      },
      togglePlay,
    }), [togglePlay]);

    const stateBadge =
      mode === "video"
        ? vodState === "ready"
          ? `视频弹幕 · ${vodCount} 条`
          : vodState === "loading"
            ? "视频弹幕加载中…"
            : vodState === "error"
              ? "弹幕接口异常"
              : "等待视频信息…"
        : liveState === "ready"
          ? "直播弹幕 · SSE"
          : liveState === "loading"
            ? "直播连接中…"
            : liveState === "error"
              ? "直播连接异常"
              : "直播未启动";

    return (
      <div className="group relative aspect-video w-full select-none overflow-hidden rounded-xl bg-black shadow-2xl">
        <video
          ref={videoRef}
          src={COMPOSER_DEMO_VIDEO}
          loop={mode === "live"}
          playsInline
          preload="auto"
          onClick={togglePlay}
          className="absolute inset-0 h-full w-full object-contain"
        />

        {/* 经典默认弹幕层（片段外），不拦截指针；视频缓冲时冻结 */}
        <div className="pointer-events-none absolute inset-0 z-5">
          <ClassicDanmakuLayer ref={classicRef} playing={playing && !buffering} />
        </div>

        {/* 特效层（片段内），不拦截指针，点击穿透到视频用于播放/暂停；视频缓冲时冻结，片段外冻结并隐藏 */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-6",
            !sandboxActive && "invisible",
          )}
        >
          <EffectSandbox
            ref={sandboxRef}
            source={activeSource.source}
            recipe={activeSource.recipe}
            assets={activeSource.assets}
            playing={playing && !buffering && sandboxActive}
            onFps={setFps}
            onError={setEffectError}
          />
        </div>

        {/* 徽标 */}
        <div className="absolute top-3 right-3 z-8 flex items-center gap-2">
          <span className="rounded-full border border-white/20 bg-black/50 px-2.5 py-0.5 text-xs text-white/85">
            {fps} FPS
          </span>
          <span
            className={cn(
              "rounded-full border border-white/20 bg-black/50 px-2.5 py-0.5 text-xs",
              stateBadge.includes("异常") ? "text-red-300" : "text-bili-blue",
            )}
          >
            {stateBadge}
          </span>
          {effectError && (
            <span
              className="max-w-52 truncate rounded-full border border-red-300/40 bg-red-950/70 px-2.5 py-0.5 text-xs text-red-200"
              title={effectError}
            >
              Effect 运行错误
            </span>
          )}
        </div>

        {/* 加载指示：弹幕未就绪 / 视频缓冲期间强制等待，弹幕同步冻结 */}
        {(buffering || danmakuLoading) && (
          <div className="pointer-events-none absolute top-1/2 left-1/2 z-7 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            <span className="text-xs text-white/70">
              {danmakuLoading ? "弹幕加载中，就绪后自动播放…" : "视频加载中…"}
            </span>
          </div>
        )}

        {/* 暂停大图标 */}
        {!playing && !buffering && !danmakuLoading && (
          <div className="pointer-events-none absolute top-1/2 left-1/2 z-7 flex h-18 w-18 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/45">
            <svg viewBox="0 0 24 24" className="h-8 w-8 fill-white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
      </div>
    );
  },
);
