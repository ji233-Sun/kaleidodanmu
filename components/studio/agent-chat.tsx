"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Recipe } from "@/lib/types";
import type { AgentStep } from "@/lib/agent";
import { buildCreationScript, buildRefineScript } from "@/lib/agent";
import { recipeFromPrompt, refineRecipe } from "@/lib/recipes";
import { cn } from "@/lib/cn";

type Msg =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; streaming: boolean }
  | {
      id: number;
      role: "tool";
      tool: string;
      args: string;
      result: string;
      status: "running" | "done";
    };

let msgId = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Omit 默认不在联合类型上分发，这里需要分发版本 */
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export function AgentChat({
  recipe,
  autoPrompt,
  creationName,
  creationRecipe,
  intro,
  onApply,
  className,
}: {
  /** 当前配方（迭代时基于它修改） */
  recipe: Recipe | null;
  /** 首屏一句话：传入后自动执行创建脚本 */
  autoPrompt?: string;
  /** 指定创建产物（广场二创时复用原配方，缺省则按 prompt 推断） */
  creationName?: string;
  creationRecipe?: Recipe;
  /** 开场提示（继续迭代已有万花筒时展示上下文） */
  intro?: string;
  /** 脚本产出新配方时回调（父组件刷新预览/保存版本） */
  onApply: (recipe: Recipe, name?: string, changes?: string[]) => void;
  className?: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(() =>
    intro ? [{ id: ++msgId, role: "assistant", text: intro, streaming: false }] : [],
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);
  const startedRef = useRef(false);
  // 脚本执行期间需要最新的 recipe，但不需要触发重渲染
  const recipeRef = useRef<Recipe | null>(recipe);
  useEffect(() => {
    recipeRef.current = recipe;
  }, [recipe]);

  const push = useCallback((m: DistOmit<Msg, "id">) => {
    const id = ++msgId;
    setMsgs((prev) => [...prev, { ...m, id } as Msg]);
    return id;
  }, []);

  const patch = useCallback((id: number, part: Partial<Msg>) => {
    setMsgs((prev) => prev.map((m) => (m.id === id ? ({ ...m, ...part } as Msg) : m)));
  }, []);

  /* ---------- 脚本驱动器：模拟 coding agent 的“生成 → 校验 → 刷新预览” ---------- */
  const runScript = useCallback(
    async (steps: AgentStep[]) => {
      setBusy(true);
      cancelRef.current = false;
      for (const step of steps) {
        if (cancelRef.current) break;
        if (step.type === "say") {
          const id = push({ role: "assistant", text: "", streaming: true });
          // 流式输出
          for (let i = 0; i < step.text.length; i += 3) {
            if (cancelRef.current) break;
            patch(id, { text: step.text.slice(0, i + 3) });
            await sleep(18);
          }
          patch(id, { text: step.text, streaming: false });
          await sleep(250);
        } else if (step.type === "tool") {
          const id = push({
            role: "tool",
            tool: step.tool,
            args: step.args,
            result: "",
            status: "running",
          });
          await sleep(step.duration ?? 800);
          patch(id, { status: "done", result: step.result });
          await sleep(200);
        } else {
          onApply(step.recipe, step.name, step.changes);
        }
      }
      setBusy(false);
    },
    [onApply, patch, push],
  );

  /* ---------- 首屏创建 ---------- */
  useEffect(() => {
    if (!autoPrompt || startedRef.current) return;
    startedRef.current = true;
    push({ role: "user", text: autoPrompt });
    const inferred = creationRecipe
      ? { name: creationName ?? "幻彩万花筒", recipe: creationRecipe }
      : recipeFromPrompt(autoPrompt);
    void runScript(buildCreationScript(autoPrompt, inferred.name, inferred.recipe));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompt]);

  /* ---------- 用户迭代指令 ---------- */
  const send = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    push({ role: "user", text });
    const base = recipeRef.current;
    if (!base) {
      const { name, recipe: r } = recipeFromPrompt(text);
      void runScript(buildCreationScript(text, name, r));
    } else {
      const { recipe: next, changes } = refineRecipe(base, text);
      void runScript(buildRefineScript(text, changes, next));
    }
  }, [input, busy, push, runScript]);

  /* ---------- 自动滚动 ---------- */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* 头部 */}
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="flex h-5.5 w-5.5 items-center justify-center rounded-md bg-gradient-to-br from-bili-blue via-bili-purple to-bili-pink text-[10px] font-bold text-white">
          K
        </span>
        <span className="text-sm font-semibold text-ink">Kaleido Agent</span>
        <span className="rounded-full bg-bili-blue-light px-2 py-0.5 text-[11px] text-bili-blue">
          浏览器内运行 · Mock
        </span>
        {busy && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-3">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-bili-pink border-t-transparent" />
            工作中…
          </span>
        )}
      </div>

      {/* 消息流 */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <p className="pt-8 text-center text-sm text-ink-3">
            描述你想要的弹幕效果，Agent 会生成并实时预览。
          </p>
        )}
        {msgs.map((m) => {
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-bili-pink px-3.5 py-2 text-sm whitespace-pre-wrap text-white">
                  {m.text}
                </div>
              </div>
            );
          }
          if (m.role === "assistant") {
            return (
              <div key={m.id} className="flex gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-gradient-to-br from-bili-blue via-bili-purple to-bili-pink text-[10px] font-bold text-white">
                  K
                </span>
                <div className="max-w-[85%] text-sm leading-6 whitespace-pre-wrap text-ink">
                  {m.text}
                  {m.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-bili-pink align-middle" />}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="ml-8.5">
              <div className="flex items-center gap-2 font-mono text-xs">
                {m.status === "running" ? (
                  <span className="h-3 w-3 flex-none animate-spin rounded-full border-2 border-bili-blue border-t-transparent" />
                ) : (
                  <span className="flex-none text-success">✓</span>
                )}
                <span className="font-semibold text-bili-purple">{m.tool}</span>
                {m.args && <span className="text-ink-3">({m.args})</span>}
              </div>
              {m.status === "done" && (
                <p className="mt-1 border-l-2 border-line pl-3 font-mono text-xs leading-5 text-ink-2">
                  {m.result}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* 输入区 */}
      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-xl border border-line bg-fill px-3 py-2 focus-within:border-bili-pink">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={busy ? "Agent 工作中，稍等…" : "继续提修改意见，如「碎片再多一点」…"}
            disabled={busy}
            className="max-h-28 min-h-6 flex-1 resize-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 disabled:opacity-60"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-bili-pink text-white transition-opacity disabled:opacity-40"
            title="发送"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M3.4 20.4l17.4-7.5c.8-.35.8-1.45 0-1.8L3.4 3.6c-.66-.29-1.39.2-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .72.73 1.2 1.39.91z" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-ink-3">
          Enter 发送 · Shift+Enter 换行 · 代码不对外暴露，仅展示对话与预览
        </p>
      </div>
    </div>
  );
}
