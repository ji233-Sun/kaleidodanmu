"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { DanmakuEvent } from "@/lib/types";

export interface ClassicDanmakuHandle {
  emit(event: DanmakuEvent): void;
  reset(): void;
}

const LANE_HEIGHT = 32;
const SCROLL_DURATION_MS = 7000;
const FIXED_DURATION_MS = 4000;

/**
 * 经典原文弹幕层：B 站风格的滚动 / 顶部 / 底部弹幕。
 * 视频编排里播放头不在任何万花筒片段内时，弹幕以此默认形态渲染。
 */
export const ClassicDanmakuLayer = forwardRef<ClassicDanmakuHandle, { playing: boolean }>(
  function ClassicDanmakuLayer({ playing }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const laneSeqRef = useRef(0);
    const animsRef = useRef<Set<Animation>>(new Set());
    const playingRef = useRef(playing);
    playingRef.current = playing;

    useEffect(() => {
      for (const anim of animsRef.current) {
        if (playing) anim.play();
        else anim.pause();
      }
    }, [playing]);

    useImperativeHandle(
      ref,
      () => ({
        emit(event) {
          const box = containerRef.current;
          if (!box || box.clientWidth === 0) return;
          const el = document.createElement("div");
          el.textContent = event.text;
          el.className = "absolute font-bold whitespace-nowrap";
          el.style.color = `#${event.color.toString(16).padStart(6, "0")}`;
          el.style.fontSize = `${Math.max(16, event.fontSize)}px`;
          el.style.textShadow = "0 1px 3px rgba(0,0,0,0.55)";

          let anim: Animation;
          if (event.mode === "top" || event.mode === "bottom") {
            el.style.left = "50%";
            el.style.transform = "translateX(-50%)";
            if (event.mode === "top") el.style.top = "8px";
            else el.style.bottom = "8px";
            box.appendChild(el);
            anim = el.animate([{ opacity: 1 }, { opacity: 1 }], {
              duration: FIXED_DURATION_MS,
              fill: "forwards",
            });
          } else {
            const lanes = Math.max(1, Math.floor(box.clientHeight / LANE_HEIGHT));
            const lane = laneSeqRef.current++ % lanes;
            el.style.top = `${lane * LANE_HEIGHT + 4}px`;
            el.style.left = `${box.clientWidth}px`;
            box.appendChild(el);
            const distance = box.clientWidth + el.offsetWidth + 40;
            // 速度恒定：路程长则时间等比放长
            anim = el.animate(
              [{ transform: "translateX(0)" }, { transform: `translateX(-${distance}px)` }],
              {
                duration: (SCROLL_DURATION_MS * distance) / (box.clientWidth + 300),
                easing: "linear",
                fill: "forwards",
              },
            );
          }
          if (!playingRef.current) anim.pause();
          animsRef.current.add(anim);
          anim.onfinish = () => {
            animsRef.current.delete(anim);
            el.remove();
          };
        },
        reset() {
          for (const anim of animsRef.current) anim.cancel();
          animsRef.current.clear();
          containerRef.current?.replaceChildren();
        },
      }),
      [],
    );

    return (
      <div
        ref={containerRef}
        className="pointer-events-none absolute inset-0 overflow-hidden"
      />
    );
  },
);
