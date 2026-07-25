"use client";

import { useEffect, useRef, useState } from "react";
import type { EffectDto } from "@/types";
import { cn } from "@/lib/cn";

/** 时间轴上的万花筒片段：仅在 [startMs, endMs) 范围内弹幕特效生效。 */
export interface ComposerClip {
  id: string;
  effectId: number;
  startMs: number;
  endMs: number;
}

export const MIN_CLIP_MS = 500;

const TICK_STEPS_S = [1, 2, 5, 10, 15, 30, 60, 120, 300];

export function fmtTimecode(ms: number): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const ds = Math.floor((t % 1000) / 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ds}`;
}

/** 每个万花筒按 id 取一个稳定色相，用于时间轴片段配色。 */
export function clipHue(effectId: number): number {
  return (effectId * 47) % 360;
}

type DragState =
  | { kind: "seek" }
  | { kind: "move"; id: string; startX: number; origStart: number }
  | { kind: "resize"; id: string; edge: "start" | "end"; startX: number; orig: number };

interface ComposerTimelineProps {
  durationMs: number;
  currentMs: number;
  playing: boolean;
  clips: ComposerClip[];
  effects: EffectDto[];
  selectedId: string | null;
  onSelect(id: string | null): void;
  onSeek(ms: number): void;
  onMove(id: string, startMs: number): void;
  onResize(id: string, edge: "start" | "end", ms: number): void;
  onDelete(id: string): void;
}

/** 剪映风格时间轴：标尺拖动跳转 + 视频轨道 + 万花筒轨道（拖动 / 双边裁剪，禁止重叠）。 */
export function ComposerTimeline({
  durationMs,
  currentMs,
  playing,
  clips,
  effects,
  selectedId,
  onSelect,
  onSeek,
  onMove,
  onResize,
  onDelete,
}: ComposerTimelineProps) {
  const [pxPerSec, setPxPerSec] = useState(12);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const widthPx = Math.max(1, (durationMs / 1000) * pxPerSec);
  const playheadX = (currentMs / 1000) * pxPerSec;
  const stepS = TICK_STEPS_S.find((s) => s * pxPerSec >= 80) ?? 300;
  const ticks: number[] = [];
  for (let t = 0; t * 1000 <= durationMs; t += stepS) ticks.push(t);

  // 播放中让播放头保持在可视区域内
  useEffect(() => {
    if (!playing) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = (currentMs / 1000) * pxPerSec;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 120) {
      el.scrollLeft = Math.max(0, x - 120);
    }
  }, [currentMs, playing, pxPerSec]);

  const msAtClientX = (clientX: number) => {
    const el = contentRef.current;
    if (!el || durationMs <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.min(Math.max(0, (x / pxPerSec) * 1000), durationMs);
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleClipPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.kind === "seek") return;
    const deltaMs = ((e.clientX - d.startX) / pxPerSec) * 1000;
    if (d.kind === "move") onMove(d.id, d.origStart + deltaMs);
    else onResize(d.id, d.edge, d.orig + deltaMs);
  };

  const beginClipDrag = (
    e: React.PointerEvent,
    clip: ComposerClip,
    state: DragState,
  ) => {
    e.stopPropagation();
    onSelect(clip.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = state;
  };

  const effectName = (id: number) =>
    effects.find((fx) => fx.id === id)?.name ?? `#${id}`;

  const sortedClips = [...clips].sort((a, b) => a.startMs - b.startMs);

  return (
    <div className="select-none overflow-hidden rounded-xl border border-[#2a2d33] bg-[#16181d] text-white shadow-lg">
      {/* 工具栏 */}
      <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2 text-xs">
        <span className="tabular-nums text-white/85">
          {fmtTimecode(currentMs)}
          <span className="text-white/40"> / {fmtTimecode(durationMs)}</span>
        </span>
        <span className="text-white/35">拖动标尺跳转 · 拖动片段移动 · 拖动边缘裁剪</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => selectedId && onDelete(selectedId)}
            disabled={!selectedId}
            className={cn(
              "rounded-md px-2 py-1 transition-colors",
              selectedId
                ? "bg-white/10 text-white/85 hover:bg-error/80 hover:text-white"
                : "cursor-not-allowed text-white/30",
            )}
          >
            删除片段
          </button>
          <div className="flex items-center gap-1.5 border-l border-white/10 pl-2">
            <button
              onClick={() => setPxPerSec((v) => Math.max(4, v / 1.4))}
              className="flex h-6 w-6 items-center justify-center rounded-md text-white/70 hover:bg-white/10"
              title="缩小"
            >
              −
            </button>
            <input
              type="range"
              min={4}
              max={80}
              step={1}
              value={Math.round(pxPerSec)}
              onChange={(e) => setPxPerSec(Number(e.target.value))}
              className="w-24 accent-bili-pink"
              title="时间轴缩放"
            />
            <button
              onClick={() => setPxPerSec((v) => Math.min(80, v * 1.4))}
              className="flex h-6 w-6 items-center justify-center rounded-md text-white/70 hover:bg-white/10"
              title="放大"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* 左侧轨道标签列 */}
        <div className="w-20 flex-none border-r border-white/10 text-[11px] text-white/55">
          <div className="h-7 border-b border-white/10" />
          <div className="flex h-10 items-center border-b border-white/10 px-2">视频</div>
          <div className="flex h-12 items-center px-2">万花筒</div>
        </div>

        {/* 滚动区 */}
        <div ref={scrollRef} className="relative flex-1 overflow-x-auto">
          <div ref={contentRef} className="relative" style={{ width: widthPx }}>
            {/* 标尺 */}
            <div
              className="relative h-7 cursor-pointer border-b border-white/10"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                dragRef.current = { kind: "seek" };
                onSeek(msAtClientX(e.clientX));
              }}
              onPointerMove={(e) => {
                if (dragRef.current?.kind === "seek") onSeek(msAtClientX(e.clientX));
              }}
              onPointerUp={endDrag}
            >
              {ticks.map((t) => (
                <div
                  key={t}
                  className="pointer-events-none absolute top-0 h-full border-l border-white/20"
                  style={{ left: t * pxPerSec }}
                >
                  <span className="ml-1 text-[10px] leading-7 text-white/45 tabular-nums">
                    {fmtTimecode(t * 1000)}
                  </span>
                </div>
              ))}
            </div>

            {/* 视频轨道 */}
            <div className="relative h-10 border-b border-white/10 p-1">
              <div className="flex h-full w-full items-center truncate rounded bg-[#2b3f54] px-2 text-[11px] text-white/80">
                composer-demo.mp4
              </div>
            </div>

            {/* 万花筒轨道 */}
            <div className="relative h-12" onPointerDown={() => onSelect(null)}>
              {sortedClips.map((clip) => {
                const selected = clip.id === selectedId;
                const len = clip.endMs - clip.startMs;
                return (
                  <div
                    key={clip.id}
                    onPointerDown={(e) =>
                      beginClipDrag(e, clip, {
                        kind: "move",
                        id: clip.id,
                        startX: e.clientX,
                        origStart: clip.startMs,
                      })
                    }
                    onPointerMove={handleClipPointerMove}
                    onPointerUp={endDrag}
                    className={cn(
                      "absolute top-1 bottom-1 cursor-grab overflow-hidden rounded border text-white active:cursor-grabbing",
                      selected
                        ? "z-10 border-white ring-1 ring-white/70"
                        : "border-white/25",
                    )}
                    style={{
                      left: (clip.startMs / 1000) * pxPerSec,
                      width: Math.max(8, (len / 1000) * pxPerSec),
                      background: `hsl(${clipHue(clip.effectId)} 60% 38%)`,
                    }}
                    title={`${effectName(clip.effectId)} · ${fmtTimecode(clip.startMs)} - ${fmtTimecode(clip.endMs)}`}
                  >
                    <div
                      onPointerDown={(e) =>
                        beginClipDrag(e, clip, {
                          kind: "resize",
                          id: clip.id,
                          edge: "start",
                          startX: e.clientX,
                          orig: clip.startMs,
                        })
                      }
                      onPointerMove={handleClipPointerMove}
                      onPointerUp={endDrag}
                      className="absolute top-0 left-0 z-10 h-full w-2 cursor-ew-resize bg-white/30 hover:bg-white/60"
                    />
                    <div className="pointer-events-none flex h-full flex-col justify-center px-2.5">
                      <span className="truncate text-[11px] font-medium">
                        {effectName(clip.effectId)}
                      </span>
                      <span className="text-[10px] text-white/70 tabular-nums">
                        {fmtTimecode(len)}
                      </span>
                    </div>
                    <div
                      onPointerDown={(e) =>
                        beginClipDrag(e, clip, {
                          kind: "resize",
                          id: clip.id,
                          edge: "end",
                          startX: e.clientX,
                          orig: clip.endMs,
                        })
                      }
                      onPointerMove={handleClipPointerMove}
                      onPointerUp={endDrag}
                      className="absolute top-0 right-0 z-10 h-full w-2 cursor-ew-resize bg-white/30 hover:bg-white/60"
                    />
                  </div>
                );
              })}
              {clips.length === 0 && (
                <p className="pointer-events-none flex h-full items-center justify-center text-[11px] text-white/30">
                  从左侧素材库点击「插入」，把万花筒铺到时间轴上
                </p>
              )}
            </div>

            {/* 播放头 */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-bili-pink"
              style={{ left: playheadX }}
            >
              <div
                className="absolute top-0 -left-[5px] h-3 w-[11px] bg-bili-pink"
                style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
