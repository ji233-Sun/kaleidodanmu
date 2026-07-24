// 本组件仅由客户端组件 app/studio/page.tsx 渲染，无需自带 "use client"；
// 去掉它可避免被 Next RSC 插件当作 client entry（从而要求 props 可序列化，
// 对 onApply 等函数回调报 71007 误报）。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Recipe } from "@/lib/types";
import { BrowserEffectProject } from "@/lib/ade/project";
import type { AdeAgentMessage, AdeAgentTurnResponse, AdeToolCall } from "@/lib/ade/protocol";
import type { AdeChatMessage, AdeSessionPayload } from "@/types";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/cn";

type ChatMsg = AdeChatMessage;
type ToolMsg = Extract<AdeChatMessage, { role: "tool" }>;

const MAX_AGENT_ROUNDS = 8;
/** 服务端历史拉取的稳定键；同一会话在刷新前后保持一致。 */
const SESSION_PATH = (targetKey: string) =>
  `/api/ade/session/${encodeURIComponent(targetKey)}`;
/** 连续两轮提示词完全相同时视为同一会话，跳过自动重放。 */
function sameInstruction(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

const TOOL_LABEL: Record<AdeToolCall["name"], string> = {
  read_file: "读取文件",
  write_file: "写入文件",
  validate: "校验工程",
  refresh_preview: "刷新预览",
};

/**
 * 旧版本曾把 intro 当作普通助手消息持久化进会话历史，导致每次加载重复叠加。
 * 恢复历史时按这个固定模板识别并清掉存量副本；现在的 intro 只做临时展示，不落盘。
 */
const LEGACY_INTRO_RE =
  /^已加载「[\s\S]*」（当前 v\d+）。\n\n原始需求：「[\s\S]*」\n\n直接告诉我你想怎么调整画面、动画或交互。$/;

/** 从工具参数里提取一行可读摘要（路径、文件大小）。 */
function summarizeCall(call: AdeToolCall): string {
  try {
    const args: unknown = call.arguments ? JSON.parse(call.arguments) : {};
    if (!args || typeof args !== "object") return "";
    const path = (args as { path?: unknown }).path;
    if (call.name === "read_file") return typeof path === "string" ? path : "";
    if (call.name === "write_file" && typeof path === "string") {
      const content = (args as { content?: unknown }).content;
      const size = typeof content === "string" ? ` · ${(content.length / 1000).toFixed(1)}k 字符` : "";
      return path + size;
    }
    return "";
  } catch {
    return "";
  }
}

/** 每个用户指令开启独立上游轮次；工程状态由浏览器文件提供，本轮工具链在循环中追加。 */
function buildTurnMessages(currentInstruction: string): AdeAgentMessage[] {
  return [{ role: "user", content: currentInstruction }];
}

/** 恢复历史时把「生成中」残留规整为「已中断」，避免刷新后永远转圈。 */
function normalizeRestored(restored: ChatMsg[]): ChatMsg[] {
  const normalized = restored.map((m) =>
    m.role === "tool" && m.status === "running"
      ? { ...m, status: "error" as const, detail: "生成被刷新中断" }
      : m,
  );
  const last = normalized[normalized.length - 1];
  if (last && last.role !== "assistant") {
    normalized.push({
      role: "assistant",
      text: "上次生成被刷新中断了。发送消息让我继续调整，或重新描述你的需求。",
    });
  }
  return normalized;
}

export function AgentChat({
  recipe,
  entrySource,
  autoPrompt,
  creationName,
  creationRecipe,
  intro,
  targetKey,
  aliasKeys,
  externalPrompt,
  onExternalPromptConsumed,
  onApply,
  onBusyChange,
  className,
}: {
  recipe: Recipe | null;
  entrySource?: string;
  autoPrompt?: string;
  creationName?: string;
  creationRecipe?: Recipe;
  intro?: string;
  /** 用于服务端历史会话的稳定标识；同一会话在刷新前后保持一致。 */
  targetKey: string;
  /** 需要同步写入的其他会话键（如作品 id），保证换入口后仍能恢复。 */
  aliasKeys?: string[];
  /** 外部注入的指令（如「让 Agent 修复」按钮）；消费后经 onExternalPromptConsumed 确认。 */
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
  onApply: (recipe: Recipe, name?: string, changes?: string[], entrySource?: string) => void;
  onBusyChange?: (busy: boolean) => void;
  className?: string;
}) {
  const { user, loading: sessionLoading } = useSession();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadedTarget, setLoadedTarget] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const projectRef = useRef<BrowserEffectProject | null>(null);
  const projectKeyRef = useRef("");

  /** 把当前 msgs 与项目文件存到服务端；空快照也允许写（清空历史）。 */
  const persist = useCallback(
    async (nextMsgs: ChatMsg[], project: BrowserEffectProject | null) => {
      if (!user) return;
      const payload: AdeSessionPayload = {
        messages: nextMsgs,
        files: project
          ? project.snapshotFiles()
          : { "effect.json": "", "index.ts": "" },
      };
      const keys = [
        targetKey,
        ...(aliasKeys ?? []).filter((key) => key && key !== targetKey),
      ];
      await Promise.all(
        keys.map((key) =>
          apiFetch(SESSION_PATH(key), { method: "PUT", json: { payload } }).catch(() => {
            // 静默：保存失败不应阻塞用户继续对话；下次变更时再覆盖。
          }),
        ),
      );
    },
    [targetKey, aliasKeys, user],
  );

  /** 让 runAgent / send 都能复用的「推一条消息」工具。 */
  const push = useCallback((m: ChatMsg) => setMsgs((prev) => [...prev, m]), []);

  /** 推入用户指令并立即落盘：刷新发生在 600ms 防抖窗口内也不会丢指令、不会重复生成。 */
  const pushUserMessage = useCallback(
    (text: string) => {
      setMsgs((prev) => {
        const next: ChatMsg[] = [...prev, { role: "user", text }];
        void persist(next, projectRef.current);
        return next;
      });
    },
    [persist],
  );

  const ensureProject = useCallback(
    (currentRecipe: Recipe | null, currentEntrySource?: string) => {
      const fingerprint = JSON.stringify([currentRecipe, currentEntrySource]);
      if (!projectRef.current || projectKeyRef.current !== fingerprint) {
        const project = new BrowserEffectProject();
        project.hydrate(
          creationName ?? "未命名作品",
          currentRecipe ?? creationRecipe ?? {
            symmetry: 6,
            rotationSpeed: 0.16,
            motion: "spiral",
            palette: ["#00a1d6", "#fb7299", "#8b7cf6"],
            shardScale: 1,
            trail: 0.6,
            density: 1,
          },
          currentEntrySource,
        );
        projectRef.current = project;
        projectKeyRef.current = fingerprint;
      }
      return projectRef.current;
    },
    [creationName, creationRecipe],
  );

  const setBusyState = useCallback(
    (next: boolean) => {
      setBusy(next);
      onBusyChange?.(next);
    },
    [onBusyChange],
  );

  const runAgent = useCallback(
    async (instruction: string, currentRecipe: Recipe | null, currentEntrySource?: string) => {
      if (!user) {
        push({ role: "assistant", text: "登录后才能使用 Kaleido Danmu Agent 创建或调整作品。" });
        return;
      }
      setBusyState(true);
      const project = ensureProject(currentRecipe, currentEntrySource);
      // 服务端只会保存 user/assistant 文本；toolCalls 仅用于本轮驱动 LLM。
      const messages: AdeAgentMessage[] = buildTurnMessages(instruction);
      let emptyStreak = 0;
      let lastRoundApplied = false;
      try {
        for (let round = 0; round < MAX_AGENT_ROUNDS; round += 1) {
          const { message } = await apiFetch<AdeAgentTurnResponse>(
            "/api/llm/proxy",
            { method: "POST", json: { messages } },
          );
          if (message.reasoningContent) {
            push({ role: "reasoning", text: message.reasoningContent.slice(0, 4000) });
          }
          if (message.content) push({ role: "assistant", text: message.content });
          if (message.toolCalls.length === 0) {
            // 推理模型可能把输出预算耗在思考上：无正文无调用 = 截断，催它继续而不是默默结束。
            if (!message.content && emptyStreak < 2) {
              emptyStreak += 1;
              messages.push({
                role: "assistant",
                content: "（上一轮输出在思考阶段被长度上限截断。请收敛思考，直接发起下一步工具调用。）",
                toolCalls: [],
                reasoningContent: message.reasoningContent,
                reasoningSignature: message.reasoningSignature,
              });
              continue;
            }
            if (!message.content) {
              push({ role: "assistant", text: "模型连续多轮没有产出内容，请换个说法再试一次。" });
            }
            return;
          }
          emptyStreak = 0;
          const assistantEntry: AdeAgentMessage = {
            role: "assistant",
            content: message.content,
            toolCalls: message.toolCalls,
            reasoningContent: message.reasoningContent,
            reasoningSignature: message.reasoningSignature,
          };
          messages.push(assistantEntry);
          let roundApplied = false;
          for (const call of message.toolCalls) {
            const toolMsg: ToolMsg = {
              role: "tool",
              name: call.name,
              summary: summarizeCall(call),
              status: "running",
            };
            push(toolMsg);
            const execution = project.execute(call);
            const failed = execution.result.startsWith("工具失败");
            setMsgs((prev) =>
              prev.map((m) =>
                m === toolMsg
                  ? { ...toolMsg, status: failed ? "error" : "ok", detail: failed ? execution.result.slice(0, 500) : undefined }
                  : m,
              ),
            );
            if (execution.preview) {
              roundApplied = true;
              onApply(
                execution.preview.recipe,
                execution.preview.name,
                execution.preview.changes,
                execution.preview.entrySource,
              );
              projectKeyRef.current = JSON.stringify([
                execution.preview.recipe,
                execution.preview.entrySource,
              ]);
            }
            messages.push({
              role: "tool",
              toolCallId: call.id,
              content: execution.result,
            });
          }
          lastRoundApplied = roundApplied;
        }
        push({
          role: "assistant",
          text: lastRoundApplied
            ? "生成完成，预览已更新。还想调整哪里，直接告诉我。"
            : "本轮工具调用次数已达到上限；请继续描述下一步调整。",
        });
      } catch (error) {
        const text =
          error instanceof ApiError && error.status === 401
            ? "登录已失效，请重新登录后继续。"
            : error instanceof Error
              ? "Agent 暂时不可用：" + error.message
              : "Agent 暂时不可用，请稍后重试。";
        push({ role: "assistant", text });
      } finally {
        setBusyState(false);
      }
    },
    [ensureProject, onApply, push, setBusyState, user],
  );

  // 首次挂载：拉取服务端历史，恢复 msgs 与工程文件。
  const hydrated = !sessionLoading && (!user || loadedTarget === targetKey);
  useEffect(() => {
    if (sessionLoading || !user || loadedTarget === targetKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const { session } = await apiFetch<{ session: { payload: AdeSessionPayload } | null }>(
          SESSION_PATH(targetKey),
        );
        if (cancelled) return;
        const restored = normalizeRestored(session?.payload.messages ?? []).filter(
          (m) => !(m.role === "assistant" && LEGACY_INTRO_RE.test(m.text)),
        );
        const files = session?.payload.files;
        if (files && (files["effect.json"] || files["index.ts"])) {
          const project = new BrowserEffectProject();
          project.restoreFiles(files);
          projectRef.current = project;
          // 同步指纹，避免下一轮 runAgent 误判 props 漂移而把恢复的文件冲掉。
          try {
            const meta: unknown = JSON.parse(files["effect.json"]);
            const restoredRecipe =
              meta && typeof meta === "object" && "recipe" in meta
                ? (meta as { recipe: unknown }).recipe
                : null;
            projectKeyRef.current = JSON.stringify([restoredRecipe, files["index.ts"] || undefined]);
          } catch {
            projectKeyRef.current = "";
          }
        }
        // intro 不进 msgs：它随 version 变化，落盘后每次加载都会再叠一条（历史遗留见 LEGACY_INTRO_RE）。
        setMsgs(restored);
      } catch {
        if (!cancelled) setMsgs([]);
      } finally {
        if (!cancelled) setLoadedTarget(targetKey);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadedTarget, sessionLoading, user, targetKey]);

  // 自动重放 autoPrompt：仅当历史里没有相同指令且未处于工作中。
  useEffect(() => {
    if (!hydrated || !autoPrompt || startedRef.current || sessionLoading || !user || busy) return;
    if (msgs.some((m) => m.role === "user" && sameInstruction(m.text, autoPrompt))) return;
    startedRef.current = true;
    void Promise.resolve().then(() => {
      pushUserMessage(autoPrompt);
      return runAgent(autoPrompt, recipe, entrySource);
    });
  }, [autoPrompt, busy, entrySource, hydrated, msgs, pushUserMessage, recipe, runAgent, sessionLoading, user]);

  // msgs 或工程变更时，debounce 写入服务端（600ms）。
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!hydrated || !user) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(msgs, projectRef.current);
    }, 600);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [hydrated, msgs, persist, user]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || busy || sessionLoading || !user) return;
    setInput("");
    pushUserMessage(text);
    void runAgent(text, recipe, entrySource);
  }, [busy, entrySource, input, pushUserMessage, recipe, runAgent, sessionLoading, user]);

  // 消费外部注入的指令（如「让 Agent 修复」）；空闲时才接管，排队到本轮结束后执行。
  useEffect(() => {
    if (!externalPrompt || !hydrated || busy || sessionLoading || !user) return;
    onExternalPromptConsumed?.();
    void Promise.resolve().then(() => {
      pushUserMessage(externalPrompt);
      return runAgent(externalPrompt, recipe, entrySource);
    });
  }, [busy, entrySource, externalPrompt, hydrated, onExternalPromptConsumed, pushUserMessage, recipe, runAgent, sessionLoading, user]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  const empty = msgs.length === 0 && !busy && hydrated && !intro;
  const visibleMsgs = useMemo(() => msgs, [msgs]);

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="flex h-5.5 w-5.5 items-center justify-center rounded-md bg-linear-to-br from-bili-blue via-bili-purple to-bili-pink text-[10px] font-bold text-white">
          K
        </span>
        <span className="text-sm font-semibold text-ink">Kaleido Danmu Agent</span>
        <span className="rounded-full bg-bili-blue-light px-2 py-0.5 text-[11px] text-bili-blue">
          浏览器内 Agent
        </span>
      </div>
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {empty && (
          <p className="pt-8 text-center text-sm text-ink-3">
            描述你想要的弹幕效果，Agent 会在浏览器工程中生成、校验并刷新预览。
          </p>
        )}
        <div className="space-y-3">
          {/* intro 只做临时展示（随 version 实时变化），不进 msgs、不持久化。 */}
          {intro && (
            <div className="flex gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-linear-to-br from-bili-blue via-bili-purple to-bili-pink text-[10px] font-bold text-white">
                K
              </span>
              <div className="max-w-[85%] whitespace-pre-wrap text-sm leading-6 text-ink">
                {intro}
              </div>
            </div>
          )}
          {visibleMsgs.map((m, i) => {
            if (m.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-bili-pink px-3.5 py-2 text-sm text-white">
                    {m.text}
                  </div>
                </div>
              );
            }
            if (m.role === "tool") {
              return (
                <div key={i} className="flex pl-8">
                  <div
                    className={cn(
                      "flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
                      m.status === "error"
                        ? "border-red-200 bg-red-50 text-red-600"
                        : "border-line bg-fill/60 text-ink-2",
                    )}
                  >
                    {m.status === "running" ? (
                      <span className="h-3 w-3 flex-none animate-spin rounded-full border-2 border-bili-purple border-t-transparent" />
                    ) : m.status === "ok" ? (
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-none fill-success">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-none fill-red-500">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    )}
                    <span className="flex-none font-medium">{TOOL_LABEL[m.name]}</span>
                    {m.summary && <span className="truncate text-ink-3">{m.summary}</span>}
                    {m.status === "error" && m.detail && (
                      <span className="truncate" title={m.detail}>
                        {m.detail}
                      </span>
                    )}
                  </div>
                </div>
              );
            }
            if (m.role === "reasoning") {
              return (
                <div key={i} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-linear-to-br from-bili-blue via-bili-purple to-bili-pink text-[10px] font-bold text-white opacity-60">
                    K
                  </span>
                  <details className="max-w-[85%] rounded-lg border border-line bg-fill/40 px-3 py-1.5 text-xs text-ink-3">
                    <summary className="cursor-pointer select-none font-medium text-ink-2">
                      思考过程
                    </summary>
                    <p className="mt-1.5 whitespace-pre-wrap leading-5">{m.text}</p>
                  </details>
                </div>
              );
            }
            return (
              <div key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-linear-to-br from-bili-blue via-bili-purple to-bili-pink text-[10px] font-bold text-white">
                  K
                </span>
                <div className="max-w-[85%] whitespace-pre-wrap text-sm leading-6 text-ink">
                  {m.text}
                </div>
              </div>
            );
          })}
        </div>
        {busy && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="flex items-center gap-2 rounded-full bg-card/90 px-3.5 py-1.5 text-xs text-ink-2 shadow-sm ring-1 ring-line backdrop-blur">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-bili-pink border-t-transparent" />
              Agent 正在生成…
            </span>
          </div>
        )}
      </div>
      <div className="border-t border-line p-3">
        {!sessionLoading && !user && (
          <p className="mb-2 px-1 text-xs text-ink-3">
            登录后可调用模型；Agent 的工程与工具仍只运行在浏览器内。{" "}
            <Link href="/login?next=/studio" className="text-bili-pink hover:underline">
              去登录
            </Link>
          </p>
        )}
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
            placeholder={busy ? "Agent 工作中，稍等…" : "描述效果或继续提修改意见…"}
            disabled={busy || sessionLoading || !user}
            className="max-h-28 min-h-6 flex-1 resize-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 disabled:opacity-60"
          />
          <button
            onClick={send}
            disabled={busy || sessionLoading || !user || !input.trim()}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-bili-pink text-white transition-opacity disabled:opacity-40"
            title="发送"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M3.4 20.4l17.4-7.5c.8-.35.8-1.45 0-1.8L3.4 3.6c-.66-.29-1.39.2-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .72.73 1.2 1.39.91z" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-ink-3">
          Enter 发送 · Shift+Enter 换行 · 仅允许编辑浏览器内 Effect 工程
        </p>
      </div>
    </div>
  );
}
