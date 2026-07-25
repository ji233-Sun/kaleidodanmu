"use client";

import { useEffect, useRef, useState } from "react";
import type { Recipe } from "@/lib/types";
import {
  fetchEffectSource,
  type ResolvedEffectSource,
} from "@/lib/effect-source";
import { mulberry32, pick, hashString } from "@/lib/random";
import {
  EffectSandbox,
  type EffectSandboxHandle,
} from "@/components/player/effect-sandbox";
import { EffectThumb } from "@/components/effect-thumb";

const THUMB_TEXTS = [
  "前方高能", "2333", "AWSL", "一键三连", "名场面", "弹幕护体",
  "再来亿遍", "泪目", "绝绝子", "爷青回", "全体起立", "上头了",
];

interface EffectRuntimeThumbProps {
  effectId: number;
  /** 解析完成前的占位（配方近似渲染）。 */
  recipe: Recipe;
  seedText: string;
  channel: "draft" | "published";
  maybePackaged: boolean;
  /** 网页草稿快照里的自定义入口（已知时直接给）。 */
  entrySource?: string;
}

/**
 * 真实运行时缩略图：把 Effect 的真实入口（版本产物 / 自定义入口 / 默认引擎）
 * 加载进沙箱并周期性喂弹幕。解析期间先用配方近似的 EffectThumb 占位。
 */
export function EffectRuntimeThumb({
  effectId,
  recipe,
  seedText,
  channel,
  maybePackaged,
  entrySource,
}: EffectRuntimeThumbProps) {
  const [resolved, setResolved] = useState<ResolvedEffectSource | null>(null);
  const sandboxRef = useRef<EffectSandboxHandle>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEffectSource({ effectId, recipe, channel, maybePackaged, entrySource })
      .then((result) => {
        if (!cancelled) setResolved(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // recipe / entrySource 随首帧确定，不作为依赖反复拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectId, channel, maybePackaged]);

  useEffect(() => {
    if (!resolved) return;
    const rand = mulberry32(hashString(seedText));
    let i = 0;
    const timer = setInterval(() => {
      const colorHex = pick(rand, resolved.recipe.palette);
      sandboxRef.current?.emit({
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
    return () => clearInterval(timer);
  }, [resolved, seedText]);

  if (!resolved) return <EffectThumb recipe={recipe} seedText={seedText} />;

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-[#0b0d12]">
      <EffectSandbox
        ref={sandboxRef}
        source={resolved.source}
        recipe={resolved.recipe}
        assets={resolved.assets}
        playing
      />
    </div>
  );
}
