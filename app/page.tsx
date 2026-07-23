"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
    router.push(`/studio?prompt=${encodeURIComponent(p)}`);
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
          { top: "22%", dur: "24s", delay: "-13s", color: "#fb7299", text: "万花筒特效绝了" },
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
        <span className="rounded-full border border-bili-blue/30 bg-bili-blue-light px-4 py-1.5 text-xs font-medium tracking-widest text-bili-blue">
          AI 原生 · 弹幕表现层
        </span>
        <h1 className="mt-7 text-4xl leading-tight font-black tracking-tight text-ink sm:text-5xl">
          用一句话
          <span className="bg-gradient-to-r from-bili-blue via-bili-purple to-bili-pink bg-clip-text text-transparent">
            创造弹幕万花筒
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-ink-2">
          描述你想要的弹幕效果，Kaleido Agent 会在你的浏览器里写代码、自校验、刷新预览——
          不满意就继续聊，每轮修改立即可见。
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
              placeholder="描述你想要的弹幕效果，比如「玻璃碎裂成六瓣」…"
              className="h-11 min-w-0 flex-1 bg-transparent px-2 text-[15px] text-ink outline-none placeholder:text-ink-3"
            />
            <button
              onClick={() => create(prompt)}
              disabled={!prompt.trim()}
              className="h-11 flex-none rounded-xl bg-gradient-to-r from-bili-blue via-bili-purple to-bili-pink px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              创建万花筒
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
            <p className="text-sm font-semibold text-ink group-hover:text-bili-pink">我的万花筒 →</p>
            <p className="mt-1.5 text-xs leading-5 text-ink-2">
              管理你创建的所有配方，随时预览、继续对话迭代、分享或删除。
            </p>
          </Link>
          <Link
            href="/square"
            className="group rounded-2xl border border-line bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-bili-blue/50 hover:shadow-lg"
          >
            <p className="text-sm font-semibold text-ink group-hover:text-bili-blue">万花筒广场 →</p>
            <p className="mt-1.5 text-xs leading-5 text-ink-2">
              看看其他人分享的弹幕玩法，一键取用，或在原作基础上二次创作。
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
