"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

const SKILL_INSTALL = "npx -y skills add ji233-Sun/kaleidodanmu --skill kdanmu -g -y";
const CLI_INSTALL = "npm i -g kdanmu";
const AI_PROMPT =
  "请帮我配置 Kaleido 弹幕效果开发环境：先运行 `npm i -g kdanmu` 全局安装 CLI，再运行 `npx -y skills add ji233-Sun/kaleidodanmu --skill kdanmu -g -y` 安装 kdanmu skill，然后运行 `kdanmu whoami` 确认登录状态，最后告诉我如何用 kdanmu init 创建一个新效果。";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  };
  return (
    <button
      onClick={copy}
      className={cn(
        "flex-none rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        copied
          ? "border-success bg-success-light text-success"
          : "border-line bg-white text-ink-2 hover:border-bili-pink hover:text-bili-pink",
      )}
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-fill px-3 py-2">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-pre text-ink select-all">
        {code}
      </code>
      <CopyButton text={code} />
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-bili-pink-light text-sm font-bold text-bili-pink">
          {n}
        </span>
        <h2 className="text-lg font-bold text-ink">{title}</h2>
      </div>
      <div className="mt-4 space-y-3 text-sm text-ink-2">{children}</div>
    </section>
  );
}

export default function GetStartedPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="text-center">
        <span className="inline-block rounded-full border border-bili-pink/30 bg-bili-pink-light px-4 py-1.5 text-xs font-medium tracking-widest text-bili-pink">
          开始使用
        </span>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-ink">
          安装 CLI 与{" "}
          <span className="bg-linear-to-r from-bili-blue via-bili-purple to-bili-pink bg-clip-text text-transparent">
            kdanmu Skill
          </span>
        </h1>
        <p className="mt-3 text-ink-2">
          用 <code className="font-mono text-ink">kdanmu</code> 在本地开发弹幕效果，并让 AI 助手（Claude Code / Codex / Cursor 等）直接协作。
        </p>
      </div>

      <div className="mt-10 space-y-5">
        <Step n={1} title="安装 CLI">
          <p>全局安装 kdanmu 命令行（也可用 pnpm/yarn 对应命令）：</p>
          <CodeBlock code={CLI_INSTALL} />
          <p className="text-ink-3">
            安装后运行 <code className="font-mono text-ink">kdanmu --help</code> 验证；首次上传前需 <code className="font-mono text-ink">kdanmu login</code>。
          </p>
        </Step>

        <Step n={2} title="安装 Skill">
          <p>
            通过开放的 <code className="font-mono text-ink">skills</code> 生态一键安装，支持 Claude Code、Codex、Cursor 等主流助手：
          </p>
          <CodeBlock code={SKILL_INSTALL} />
          <p className="text-ink-3">
            <code className="font-mono text-ink">-g</code> 装到用户全局目录；去掉则装到当前项目（<code className="font-mono text-ink">./&lt;agent&gt;/skills/</code>）。<code className="font-mono text-ink">-y</code> 跳过所有确认。
          </p>
        </Step>

        <Step n={3} title="一句话 AI 指令">
          <p>不想手动敲命令？把下面这句直接发给你的 AI 助手，让它替你装好：</p>
          <div className="rounded-lg border border-bili-purple/30 bg-bili-purple-light/60 p-3">
            <p className="font-mono text-xs leading-relaxed text-ink">{AI_PROMPT}</p>
            <div className="mt-2 flex justify-end">
              <CopyButton text={AI_PROMPT} />
            </div>
          </div>
        </Step>

        <Step n={4} title="创建并开发效果">
          <p>装好后即可脚手架一个新效果并本地预览：</p>
          <CodeBlock code={"kdanmu init my-effect\ncd my-effect\npnpm install\nkdanmu dev"} />
          <p className="text-ink-3">
            改好后 <code className="font-mono text-ink">kdanmu build</code> 打包、<code className="font-mono text-ink">kdanmu upload</code> 上传草稿。发布到公开渠道需显式确认。
          </p>
        </Step>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm">
        <Link
          href="/square"
          className="rounded-lg bg-linear-to-r from-bili-blue via-bili-purple to-bili-pink px-5 py-2.5 font-medium text-white transition-opacity hover:opacity-90"
        >
          逛逛创作广场
        </Link>
        <a
          href="https://github.com/ji233-Sun/kaleidodanmu"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-line px-5 py-2.5 font-medium text-ink-2 transition-colors hover:border-bili-pink hover:text-bili-pink"
        >
          查看源码仓库
        </a>
      </div>
    </main>
  );
}
