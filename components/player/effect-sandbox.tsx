"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { DanmakuEvent, Recipe } from "@/lib/types";
import type { RuntimeAsset, RuntimeCommand, RuntimeEvent } from "@/lib/runtime/effect";

export interface EffectSandboxHandle {
  emit(event: DanmakuEvent): void;
  reset(): void;
}

interface EffectSandboxProps {
  source: string;
  recipe: Recipe;
  playing: boolean;
  /** 随包静态资源（base64）；运行时转 blob URL 供 assetUrl 解析。本地预览通常为空。 */
  assets?: RuntimeAsset[];
  onFps?(fps: number): void;
  onError?(message: string | null): void;
}

export const EffectSandbox = forwardRef<EffectSandboxHandle, EffectSandboxProps>(
  function EffectSandbox({ source, recipe, playing, assets, onFps, onError }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const portRef = useRef<MessagePort | null>(null);
    const readyRef = useRef(false);
    const latestRef = useRef({ source, recipe, playing, assets, onFps, onError });
    latestRef.current = { source, recipe, playing, assets, onFps, onError };

    const send = (command: RuntimeCommand) => {
      if (!readyRef.current) return;
      portRef.current?.postMessage(command);
    };

    useImperativeHandle(ref, () => ({
      emit(event) {
        send({ type: "danmaku", event });
      },
      reset() {
        send({ type: "reset" });
      },
    }), []);

    useEffect(() => {
      const latest = latestRef.current;
      latest.onError?.(null);
      send({ type: "load", source, recipe, playing: latest.playing, assets: latest.assets });
    }, [source, recipe, assets]);

    useEffect(() => {
      send({ type: "playing", playing });
    }, [playing]);

    useEffect(() => () => portRef.current?.close(), []);

    const connect = () => {
      const frame = iframeRef.current?.contentWindow;
      if (!frame) return;
      portRef.current?.close();
      readyRef.current = false;
      const channel = new MessageChannel();
      portRef.current = channel.port1;
      channel.port1.onmessage = (message: MessageEvent<RuntimeEvent>) => {
        const event = message.data;
        if (event.type === "ready") {
          if (readyRef.current) return;
          readyRef.current = true;
          const latest = latestRef.current;
          latest.onError?.(null);
          send({ type: "load", source: latest.source, recipe: latest.recipe, playing: latest.playing, assets: latest.assets });
        } else if (event.type === "fps") {
          latestRef.current.onFps?.(event.value);
        } else if (event.type === "error") {
          latestRef.current.onError?.(event.message);
        }
      };
      channel.port1.start();
      frame.postMessage({ type: "kaleido:connect" }, "*", [channel.port2]);
    };

    // 运行时就绪后会广播 boot；与 onLoad 双通道握手，覆盖 dev 下 iframe 先
    // 完成加载、React 尚未挂载导致 connect 消息丢失的竞态。
    useEffect(() => {
      const onBoot = (event: MessageEvent) => {
        if (event.source !== iframeRef.current?.contentWindow) return;
        if (event.data?.type !== "kaleido:boot" || readyRef.current) return;
        connect();
      };
      window.addEventListener("message", onBoot);
      return () => window.removeEventListener("message", onBoot);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <iframe
        ref={iframeRef}
        src="/effect-runtime"
        title="弹幕效果运行时"
        aria-hidden="true"
        // 必须保留 allow-same-origin：若去掉，iframe 会变成不透明源（origin=null），
        // WebKit/Safari 会把 CSP 的 'self' 解析为 null，从而拒绝加载同源的 _next chunk，
        // 导致 Effect 运行时整页加载失败、弹幕不渲染（Chrome 对此更宽松，故无报错）。
        // Effect 的隔离由运行时禁网（disableNetworkGlobals）+ import 白名单 + 产物校验保证，
        // 不依赖 iframe 的跨源隔离。
        sandbox="allow-scripts allow-same-origin"
        tabIndex={-1}
        onLoad={connect}
        className="absolute inset-0 h-full w-full touch-none border-0 bg-transparent"
      />
    );
  },
);
