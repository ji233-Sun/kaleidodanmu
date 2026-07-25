"use client";

import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

/** 安全链接协议：仅允许 http(s)、mailto、站内绝对路径与锚点，过滤 javascript: 等。 */
function safeHref(href?: string): string | undefined {
  if (!href) return undefined;
  return /^(https?:|mailto:|\/|#|tel:)/i.test(href) ? href : undefined;
}

/** 递归提取 React 子树的纯文本（用于代码块的「复制」内容）。 */
function nodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return "";
}

/**
 * fenced 代码块渲染成 <pre><code class="language-xxx">…</code></pre>。
 * pre 的 children 即那个 <code> 元素，从这里取出语言与文本，交给带复制按钮的 CodeBlock。
 */
function extractCode(children: ReactNode): { code: string; lang?: string } {
  const el = Array.isArray(children) ? children.find((c) => isValidElement(c)) : children;
  if (isValidElement(el)) {
    const props = el.props as { className?: string; children?: ReactNode };
    const match = /language-([\w-]+)/.exec(props.className ?? "");
    return { code: nodeText(props.children).replace(/\n$/, ""), lang: match?.[1] };
  }
  return { code: nodeText(children) };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默忽略 */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "flex-none rounded px-1.5 py-0.5 font-mono text-[11px] transition-colors",
        copied ? "text-success" : "text-white/45 hover:text-white/85",
      )}
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

/** 深色代码块：带语言标签与一键复制，避免在浅色聊天气泡里与正文混淆。 */
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-line bg-[#1f2229]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1">
        <span className="font-mono text-[11px] text-white/45">{lang ?? "code"}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 leading-5">
        <code className="font-mono text-xs text-[#e6e6e6]">{code}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  h1: ({ children }) => <h1 className="mt-3 mb-1 text-base font-bold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-1 text-[15px] font-bold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2.5 mb-1 text-sm font-bold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-2 mb-0.5 text-sm font-semibold first:mt-0">{children}</h4>,
  h5: ({ children }) => <h5 className="mt-2 mb-0.5 text-sm font-semibold first:mt-0">{children}</h5>,
  h6: ({ children }) => <h6 className="mt-2 mb-0.5 text-xs font-semibold text-ink-2 first:mt-0">{children}</h6>,
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="marker:text-ink-3">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-bili-pink/40 bg-fill/60 py-1 pl-3 text-ink-2 first:mt-0 last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-line" />,
  a: ({ href, children }) => {
    const safe = safeHref(href);
    if (!safe) return <>{children}</>;
    return (
      <a href={safe} target="_blank" rel="noopener noreferrer" className="text-bili-blue hover:underline">
        {children}
      </a>
    );
  },
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  // 块级代码：在 pre 层接管，渲染带复制按钮的深色代码块；不渲染原 children。
  pre: ({ children }) => {
    const { code, lang } = extractCode(children);
    return <CodeBlock code={code} lang={lang} />;
  },
  // 行内代码：块级 code 的外壳已由 pre 接管，这里只负责行内样式。
  code: ({ className, children }) => (
    <code className={cn("rounded bg-fill px-1 py-0.5 font-mono text-[0.85em] text-bili-pink", className)}>
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto first:mt-0 last:mb-0">
      <table className="w-full border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-line bg-fill px-2 py-1 text-left text-xs font-semibold text-ink">{children}</th>
  ),
  td: ({ children }) => <td className="border border-line px-2 py-1 text-xs text-ink-2">{children}</td>,
};

/**
 * 把 LLM 输出的 Markdown 渲染成贴合 B 站主题的 React 元素（非 innerHTML，天然防 XSS）。
 * 支持 GFM：标题、列表、强调、行内/块级代码、链接、引用、分隔线、表格、删除线等。
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        // 顶层首尾块去除外边距，避免在气泡内产生多余空白
        "text-sm leading-6 text-ink [&>:first-child]:!mt-0 [&>:last-child]:!mb-0",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
