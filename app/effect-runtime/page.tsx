"use client";

import { useEffect, useRef } from "react";
import type * as ThreeNS from "three";
import type { gsap as GsapNS } from "gsap";
import {
  validateEffectSource,
  rewriteEffectImports,
  type EffectDefinition,
  type EffectInstance,
  type RuntimeCommand,
  type RuntimeEvent,
  type RuntimeAsset,
} from "@/lib/runtime/effect";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知运行错误";
}

function disableNetworkGlobals(): void {
  const runtimeWindow = window as typeof window & { __kaleidoNetworkDisabled?: boolean };
  if (runtimeWindow.__kaleidoNetworkDisabled) return;
  runtimeWindow.__kaleidoNetworkDisabled = true;
  const deny = () => Promise.reject(new Error("Effect Runtime 禁止网络访问"));
  Object.defineProperty(window, "fetch", { configurable: true, value: deny });
  for (const key of ["XMLHttpRequest", "WebSocket", "EventSource"] as const) {
    Object.defineProperty(window, key, {
      configurable: true,
      value: class DisabledNetworkApi {
        constructor() {
          throw new Error(`Effect Runtime 禁止使用 ${key}`);
        }
      },
    });
  }
}

// 原生动态 import：绕过打包器对 import() 的静态改写，用于加载 blob 入口与 vendor 模块。
// 仅本运行时页使用（受信代码）；用户 Effect 代码始终在 blob + iframe 沙箱中执行。
const nativeImport = new Function("url", "return import(url)") as (
  url: string,
) => Promise<Record<string, unknown>>;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default function EffectRuntimePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    disableNetworkGlobals();

    // 用 document 的真实 URL 组装绝对 vendor 地址：沙箱 iframe 为不透明源，location.origin 可能是
    // "null"，但 protocol/host 仍是真实值。vendor 模块由 next.config 的 ACAO 头允许跨源加载。
    const origin = `${location.protocol}//${location.host}`;
    const vendor: Record<string, string> = {
      three: `${origin}/kaleido-runtime/vendor/three.mjs`,
      gsap: `${origin}/kaleido-runtime/vendor/gsap.mjs`,
      "kdanmu-sdk": `${origin}/kaleido-runtime/vendor/kaleido-sdk.mjs`,
    };

    let port: MessagePort | null = null;
    let effect: EffectInstance | null = null;
    let frameId = 0;
    let playing = false;
    let lastFrame = performance.now();
    let fpsStartedAt = lastFrame;
    let fpsFrames = 0;
    let threeMod: typeof ThreeNS | null = null;
    let gsapMod: typeof GsapNS | null = null;
    let assetUrls: string[] = [];

    const send = (event: RuntimeEvent) => port?.postMessage(event);

    const ensureVendor = async () => {
      if (!threeMod) threeMod = (await nativeImport(vendor.three)) as unknown as typeof ThreeNS;
      if (!gsapMod) {
        const mod = (await nativeImport(vendor.gsap)) as { gsap: typeof GsapNS };
        gsapMod = mod.gsap;
      }
    };

    const clearAssets = () => {
      for (const url of assetUrls) URL.revokeObjectURL(url);
      assetUrls = [];
      (globalThis as { __KALEIDO_ASSETS__?: Record<string, string> }).__KALEIDO_ASSETS__ = {};
    };

    const registerAssets = (assets: RuntimeAsset[] | undefined) => {
      clearAssets();
      const registry: Record<string, string> = {};
      for (const asset of assets ?? []) {
        const bytes = base64ToBytes(asset.data);
        const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: asset.mime }));
        registry[asset.path] = url;
        assetUrls.push(url);
      }
      (globalThis as { __KALEIDO_ASSETS__?: Record<string, string> }).__KALEIDO_ASSETS__ = registry;
    };

    const viewport = () => ({
      width: Math.max(1, canvas.clientWidth),
      height: Math.max(1, canvas.clientHeight),
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    });

    const resize = () => {
      if (!effect) return;
      try {
        effect.resize(viewport());
        if (!playing) effect.render({ now: performance.now(), delta: 0 });
      } catch (error) {
        send({ type: "error", message: errorMessage(error) });
      }
    };

    const stopLoop = () => {
      cancelAnimationFrame(frameId);
      frameId = 0;
    };

    const dispose = () => {
      stopLoop();
      clearAssets();
      if (!effect) return;
      try {
        effect.dispose();
      } finally {
        effect = null;
      }
    };

    const loop = (now: number) => {
      frameId = requestAnimationFrame(loop);
      const delta = Math.min(64, now - lastFrame);
      lastFrame = now;
      if (!effect || !playing) return;
      try {
        effect.render({ now, delta });
        fpsFrames += 1;
        if (now - fpsStartedAt >= 500) {
          send({ type: "fps", value: Math.round((fpsFrames * 1000) / (now - fpsStartedAt)) });
          fpsFrames = 0;
          fpsStartedAt = now;
        }
      } catch (error) {
        send({ type: "error", message: errorMessage(error) });
        dispose();
      }
    };

    const load = async (command: Extract<RuntimeCommand, { type: "load" }>) => {
      dispose();
      try {
        validateEffectSource(command.source);
        registerAssets(command.assets);
        await ensureVendor();

        const rewritten = rewriteEffectImports(command.source, vendor);
        const blobUrl = URL.createObjectURL(new Blob([rewritten], { type: "text/javascript" }));
        let definition: EffectDefinition;
        try {
          const mod = await nativeImport(blobUrl);
          definition = (mod as { default?: EffectDefinition }).default as EffectDefinition;
        } finally {
          URL.revokeObjectURL(blobUrl);
        }

        if (!definition || typeof definition.setup !== "function") {
          throw new Error("Effect 默认导出必须实现 setup()");
        }
        effect = definition.setup({ canvas, recipe: command.recipe, THREE: threeMod!, gsap: gsapMod! });
        if (
          !effect ||
          typeof effect.render !== "function" ||
          typeof effect.resize !== "function" ||
          typeof effect.dispose !== "function"
        ) {
          throw new Error("setup() 必须返回完整的 Effect 生命周期");
        }
        playing = command.playing;
        effect.resize(viewport());
        effect.setPlaying?.(playing);
        effect.render({ now: performance.now(), delta: 0 });
        lastFrame = performance.now();
        fpsStartedAt = lastFrame;
        fpsFrames = 0;
        frameId = requestAnimationFrame(loop);
        send({ type: "ready" });
      } catch (error) {
        dispose();
        send({ type: "error", message: errorMessage(error) });
      }
    };

    const onCommand = (message: MessageEvent<RuntimeCommand>) => {
      const command = message.data;
      if (!command || typeof command !== "object") return;
      try {
        if (command.type === "load") {
          void load(command);
        } else if (command.type === "danmaku") {
          effect?.onDanmaku?.(command.event);
        } else if (command.type === "playing") {
          playing = command.playing;
          effect?.setPlaying?.(playing);
          lastFrame = performance.now();
        } else if (command.type === "reset") {
          effect?.reset?.();
        }
      } catch (error) {
        send({ type: "error", message: errorMessage(error) });
      }
    };

    const onConnect = (event: MessageEvent) => {
      if (event.data?.type !== "kaleido:connect" || !event.ports[0]) return;
      port?.close();
      port = event.ports[0];
      port.addEventListener("message", onCommand);
      port.start();
      send({ type: "ready" });
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const pointerType = (type: "down" | "move" | "up" | "cancel") =>
      (event: PointerEvent) => {
        if (!effect?.onPointer) return;
        const rect = canvas.getBoundingClientRect();
        if (type === "down") canvas.setPointerCapture(event.pointerId);
        try {
          effect.onPointer({
            type,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            nx: (event.clientX - rect.left) / Math.max(1, rect.width),
            ny: (event.clientY - rect.top) / Math.max(1, rect.height),
            pressure: event.pressure,
            pointerId: event.pointerId,
            pointerType: event.pointerType,
          });
        } catch (error) {
          send({ type: "error", message: errorMessage(error) });
        }
      };
    const onPointerDown = pointerType("down");
    const onPointerMove = pointerType("move");
    const onPointerUp = pointerType("up");
    const onPointerCancel = pointerType("cancel");
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("message", onConnect);
    // 主动向宿主宣告就绪：父页面的 connect 若先于本页挂载而丢失，可凭 boot 重连。
    window.parent.postMessage({ type: "kaleido:boot" }, "*");
    return () => {
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("message", onConnect);
      port?.removeEventListener("message", onCommand);
      port?.close();
      dispose();
    };
  }, []);

  return (
    <>
      <style>{`html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent !important; } body > header { display: none !important; }`}</style>
      <canvas ref={canvasRef} className="fixed inset-0 block h-full w-full bg-transparent" />
    </>
  );
}
