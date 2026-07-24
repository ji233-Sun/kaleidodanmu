"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { newStudioSessionId } from "@/lib/store";

const EXAMPLES = [
  "玻璃碎裂成六瓣，弹幕沿碎片边缘流动",
  "弹幕像花瓣一样绽放成八重曼陀罗",
  "弹幕化作星辰沿银河轨道环绕",
  "赛博朋克霓虹风格，弹幕高速穿行",
];

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  const create = (text: string) => {
    const p = text.trim();
    if (!p) return;
    const params = new URLSearchParams({
      prompt: p,
      session: newStudioSessionId(),
    });
    router.push(`/studio?${params.toString()}`);
  };

  return (
    <main className="relative flex flex-1 flex-col">
      {/* 装饰弹幕轨道 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_15%,#000_70%,transparent)]"
      >
        {[
          { top: "12%", dur: "19s", delay: "-4s", color: "#00a1d6", text: "这弹幕会开花！" },
          { top: "22%", dur: "24s", delay: "-13s", color: "#fb7299", text: "这个 Canvas 效果绝了" },
          { top: "68%", dur: "21s", delay: "-8s", color: "#8b7cf6", text: "镜像对称好美" },
          { top: "80%", dur: "26s", delay: "-17s", color: "#7ee0a3", text: "AI 生成的特效？！" },
          { top: "88%", dur: "18s", delay: "-2s", color: "#ffd166", text: "这配方我抄了" },
        ].map((d, i) => (
          <span
            key={i}
            className="animate-dm-fly absolute left-full text-sm font-bold whitespace-nowrap opacity-40"
            style={{ top: d.top, color: d.color, animationDuration: d.dur, animationDelay: d.delay }}
          >
            {d.text}
          </span>
        ))}
      </div>

      <section className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <span className="rounded-full border border-bili-pink/30 bg-bili-pink-light px-4 py-1.5 text-xs font-medium tracking-widest text-bili-pink">
          弹幕下一个二十年 · AI 原生创作
        </span>
        <h1 className="mt-7 text-4xl leading-tight font-black tracking-tight text-ink sm:text-5xl">
          让弹幕
          <span className="bg-gradient-to-r from-bili-blue via-bili-purple to-bili-pink bg-clip-text text-transparent">
            长出新的表现力
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-ink-2">
          描述弹幕应该如何出现、移动、聚合或回应画面。Canvas Agent 会把每一条消息变成可感知的视觉事件，
          在浏览器里创作、自校验、刷新预览。
        </p>

        {/* 一句话创建 */}
        <div className="mt-10 w-full">
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-card p-2 shadow-[0_8px_40px_rgba(24,25,28,.08)] transition-colors focus-within:border-bili-pink">
            <span className="ml-2 hidden h-6 w-6 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-bili-blue via-bili-purple to-bili-pink text-xs font-bold text-white sm:flex">
              K
            </span>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create(prompt);
              }}
              placeholder="描述弹幕如何运动，比如「玻璃碎裂成六瓣，弹幕沿碎片边缘流动」…"
              className="h-11 min-w-0 flex-1 bg-transparent px-2 text-[15px] text-ink outline-none placeholder:text-ink-3"
            />
            <button
              onClick={() => create(prompt)}
              disabled={!prompt.trim()}
              className="h-11 flex-none rounded-xl bg-gradient-to-r from-bili-blue via-bili-purple to-bili-pink px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              开始编排弹幕
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => create(ex)}
                className="rounded-full border border-line bg-card px-3.5 py-1.5 text-xs text-ink-2 transition-colors hover:border-bili-pink hover:text-bili-pink"
              >
              {ex}
              </button>
            ))}
          </div>
        </div>

        {/* 入口卡片 */}
        <div className="mt-16 grid w-full gap-4 sm:grid-cols-2">
          <Link
            href="/mine"
            className="group rounded-2xl border border-line bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-bili-pink/50 hover:shadow-lg"
          >
            <p className="text-sm font-semibold text-ink group-hover:text-bili-pink">我的作品 →</p>
            <p className="mt-1.5 text-xs leading-5 text-ink-2">
              管理你创建的所有配方，随时预览、继续对话迭代、分享或删除。
            </p>
          </Link>
          <Link
            href="/square"
            className="group rounded-2xl border border-line bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-bili-blue/50 hover:shadow-lg"
          >
            <p className="text-sm font-semibold text-ink group-hover:text-bili-blue">创作广场 →</p>
            <p className="mt-1.5 text-xs leading-5 text-ink-2">
              看看其他人分享的弹幕玩法，一键取用，或在原作基础上二次创作。
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
