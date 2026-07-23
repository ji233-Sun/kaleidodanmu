"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import * as THREE from "three";
import {
  transformEffectSource,
  type EffectDefinition,
  type EffectInstance,
  type RuntimeCommand,
  type RuntimeEvent,
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

function compileEffect(source: string): EffectDefinition {
  const body = transformEffectSource(source);
  const factory = new Function("defineEffect", "THREE", "gsap", `"use strict";\n${body}`);
  const defineEffect = (definition: EffectDefinition) => definition;
  const definition = factory(defineEffect, THREE, gsap) as EffectDefinition;
  if (!definition || typeof definition.setup !== "function") {
    throw new Error("Effect 默认导出必须实现 setup()");
  }
  return definition;
}

export default function EffectRuntimePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    disableNetworkGlobals();

    let port: MessagePort | null = null;
    let effect: EffectInstance | null = null;
    let frameId = 0;
    let playing = false;
    let lastFrame = performance.now();
    let fpsStartedAt = lastFrame;
    let fpsFrames = 0;

    const send = (event: RuntimeEvent) => port?.postMessage(event);

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

    const load = (command: Extract<RuntimeCommand, { type: "load" }>) => {
      dispose();
      try {
        const definition = compileEffect(command.source);
        effect = definition.setup({ canvas, recipe: command.recipe, THREE, gsap });
        if (
          !effect ||
          typeof effect.onDanmaku !== "function" ||
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
          load(command);
        } else if (command.type === "danmaku") {
          effect?.onDanmaku(command.event);
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
    window.addEventListener("message", onConnect);
    return () => {
      observer.disconnect();
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
