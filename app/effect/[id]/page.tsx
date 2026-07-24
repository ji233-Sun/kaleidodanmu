"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { DanmakuEvent, Recipe } from "@/lib/types";
import type { RuntimeAsset } from "@/lib/runtime/effect";
import { EffectSandbox, type EffectSandboxHandle } from "@/components/player/effect-sandbox";

interface ArtifactResponse {
  manifestJson: string;
  entry: { path: string; mime: string; data: string };
  assets: RuntimeAsset[];
  version: { version: string };
}

const DEFAULT_RECIPE: Recipe = {
  symmetry: 6,
  rotationSpeed: 0,
  motion: "flow",
  palette: ["#081229", "#8dd8ff"],
  shardScale: 1,
  trail: 0.2,
  density: 1,
};

const WORDS = ["万花筒", "弹幕来了", "666", "前方高能", "Canvas!", "主播牛", "哈哈哈哈", "打卡", "好活", "泪目"];

/** base64（UTF-8 字节）→ 文本。 */
function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; source: string; recipe: Recipe; assets: RuntimeAsset[]; version: string };

export default function EffectPlayPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [fps, setFps] = useState(0);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const sandboxRef = useRef<EffectSandboxHandle>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/effects/${id}/artifact?channel=published`);
        if (!res.ok) {
          const data: unknown = await res.json().catch(() => null);
          const msg =
            res.status === 404
              ? "没有已发布的公开版本（或作品为私有）"
              : (data as { error?: { message?: string } } | null)?.error?.message ?? `请求失败（HTTP ${res.status}）`;
          throw new Error(msg);
        }
        const art = (await res.json()) as ArtifactResponse;
        if (cancelled) return;
        let recipe = DEFAULT_RECIPE;
        try {
          const manifest = JSON.parse(art.manifestJson) as { recipe?: Recipe };
          if (manifest?.recipe) recipe = manifest.recipe;
        } catch {
          /* 用默认配方 */
        }
        setState({
          status: "ready",
          source: decodeBase64Utf8(art.entry.data),
          recipe,
          assets: art.assets ?? [],
          version: art.version?.version ?? "",
        });
      } catch (e) {
        if (!cancelled) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // 注入 mock 弹幕，制造可见动效
  useEffect(() => {
    if (state.status !== "ready") return;
    let seed = 1;
    const timer = setInterval(() => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const event: DanmakuEvent = {
        id: "m" + seed,
        source: "live",
        text: WORDS[seed % WORDS.length],
        receivedAt: Date.now(),
        mode: "scroll",
        color: 0xffffff,
        fontSize: 28,
        weight: 400,
        seed,
      };
      sandboxRef.current?.emit(event);
    }, 700);
    return () => clearInterval(timer);
  }, [state.status]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link href="/square" className="text-sm text-ink-2 hover:text-bili-pink">
          ← 返回广场
        </Link>
        <h1 className="text-lg font-bold text-ink">云端效果播放 · #{id}</h1>
        {state.status === "ready" && state.version && (
          <span className="rounded bg-fill px-2 py-0.5 text-xs text-ink-3">v{state.version}</span>
        )}
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-black">
        {state.status === "ready" ? (
          <EffectSandbox
            ref={sandboxRef}
            source={state.source}
            recipe={state.recipe}
            assets={state.assets}
            playing
            onFps={setFps}
            onError={setRuntimeError}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-3">
            {state.status === "loading" ? "加载中…" : `无法播放：${state.message}`}
          </div>
        )}
        {state.status === "ready" && (
          <div className="pointer-events-none absolute left-3 top-2 text-xs text-[#8dd8ff]">{fps} fps</div>
        )}
      </div>

      {runtimeError && <p className="mt-2 text-sm text-red-500">运行错误：{runtimeError}</p>}
      <p className="mt-3 text-xs leading-6 text-ink-3">
        本页把该作品「已发布」版本的产物（入口 ESM + 静态资源）注入隔离沙箱播放：沙箱禁用网络、仅允许
        three / gsap / @kaleido/sdk，资源以 blob 注入。这正是 CLI `kdanmu upload/publish` 上传的包在平台上的运行效果。
      </p>
    </main>
  );
}
