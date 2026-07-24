"use client";

import { useEffect, useRef } from "react";
import type { Recipe } from "@/lib/types";
import { KaleidoRenderer } from "@/lib/renderer";
import { mulberry32, pick } from "@/lib/random";
import { hashString } from "@/lib/random";

const THUMB_TEXTS = [
  "前方高能", "2333", "AWSL", "一键三连", "名场面", "弹幕护体",
  "再来亿遍", "泪目", "绝绝子", "爷青回", "全体起立", "上头了",
];

/** 卡片缩略图：运行缩小版实时预览（接入后端后可换成快照图）。 */
export function EffectThumb({ recipe, seedText }: { recipe: Recipe; seedText: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new KaleidoRenderer(canvas, recipe);
    renderer.start();
    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(canvas);

    const rand = mulberry32(hashString(seedText));
    let i = 0;
    const timer = setInterval(() => {
      const colorHex = pick(rand, recipe.palette);
      renderer.emit({
        id: `thumb-${i++}`,
        source: "vod",
        text: pick(rand, THUMB_TEXTS),
        receivedAt: 0,
        mode: "scroll",
        color: parseInt(colorHex.slice(1), 16),
        fontSize: 14,
        weight: 5,
        seed: Math.floor(rand() * 1e9),
      });
    }, 520);

    return () => {
      clearInterval(timer);
      ro.disconnect();
      renderer.stop();
    };
  }, [recipe, seedText]);

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-[#0b0d12]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
