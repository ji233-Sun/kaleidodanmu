"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Recipe } from "@/lib/types";
import { BrowserEffectProject } from "@/lib/ade/project";
import type { AdeAgentMessage, AdeAgentTurnResponse } from "@/lib/ade/protocol";
import type { AdeSessionPayload } from "@/types";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/cn";

type ChatMsg = { role: "user"; text: string } | { role: "assistant"; text: string };

const MAX_AGENT_ROUNDS = 6;
/** 服务端历史拉取的稳定键；同一会话在刷新前后保持一致。 */
const SESSION_PATH = (targetKey: string) =>
  `/api/ade/session/${encodeURIComponent(targetKey)}`;
/** 连续两轮提示词完全相同时视为同一会话，跳过自动重放。 */
function sameInstruction(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

/** 把聊天记录压缩成发给 LLM 的 messages（首个 user 是当前指令，后续是历史摘要）。 */
function buildTurnMessages(currentInstruction: string, history: ChatMsg[]): AdeAgentMessage[] {
  const tail = history.slice(-MAX_AGENT_ROUNDS * 2);
  return [
    { role: "user", content: currentInstruction },
    ...tail
      .filter((m): m is { role: "assistant"; text: string } => m.role === "assistant" && m.text.length > 0)
      .map((m) => ({ role: "assistant" as const, content: m.text, toolCalls: [] })),
  ];
}

export function AgentChat({
  recipe,
  entrySource,
  autoPrompt,
  creationName,
  creationRecipe,
  intro,
  targetKey,
  onApply,
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
  onApply: (recipe: Recipe, name?: string, changes?: string[], entrySource?: string) => void;
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
      try {
        await apiFetch(SESSION_PATH(targetKey), { method: "PUT", json: { payload } });
      } catch {
        // 静默：保存失败不应阻塞用户继续对话；下次轮询时再覆盖。
      }
    },
    [targetKey, user],
  );

  /** 让 runAgent / send 都能复用的「推一条消息」工具。 */
  const push = useCallback((m: ChatMsg) => setMsgs((prev) => [...prev, m]), []);

  const ensureProject = useCallback(
    (currentRecipe: Recipe | null, currentEntrySource?: string) => {
      const fingerprint = JSON.stringify([currentRecipe, currentEntrySource]);
      if (!projectRef.current || projectKeyRef.current !== fingerprint) {
        const project = new BrowserEffectProject();
        project.hydrate(
          creationName ?? "未命名万花筒",
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

  const runAgent = useCallback(
    async (instruction: string, currentRecipe: Recipe | null, currentEntrySource?: string) => {
      if (!user) {
        push({ role: "assistant", text: "登录后才能使用浏览器内 Kaleido ADE 创建或调整效果。" });
        return;
      }
      setBusy(true);
      const project = ensureProject(currentRecipe, currentEntrySource);
      // 服务端只会保存 user/assistant 文本；toolCalls 仅用于本轮驱动 LLM。
      const messages: AdeAgentMessage[] = buildTurnMessages(instruction, msgs);
      try {
        for (let round = 0; round < MAX_AGENT_ROUNDS; round += 1) {
          const { message } = await apiFetch<AdeAgentTurnResponse>(
            "/api/llm/proxy",
            { method: "POST", json: { messages } },
          );
          if (message.content) push({ role: "assistant", text: message.content });
          if (message.toolCalls.length === 0) return;
          const assistantEntry: AdeAgentMessage = {
            role: "assistant",
            content: message.content,
            toolCalls: message.toolCalls,
            reasoningContent: message.reasoningContent,
          };
          messages.push(assistantEntry);
          for (const call of message.toolCalls) {
            const execution = project.execute(call);
            if (execution.preview) {
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
        }
        push({ role: "assistant", text: "本轮工具调用次数已达到上限；请继续描述下一步调整。" });
      } catch (error) {
        const text =
          error instanceof ApiError && error.status === 401
            ? "登录已失效，请重新登录后继续。"
            : error instanceof Error
              ? "Agent 暂时不可用：" + error.message
              : "Agent 暂时不可用，请稍后重试。";
        push({ role: "assistant", text });
      } finally {
        setBusy(false);
      }
    },
    [ensureProject, msgs, onApply, push, user],
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
        const restored = session?.payload.messages ?? [];
        const files = session?.payload.files;
        if (files && (files["effect.json"] || files["index.ts"])) {
          const project = new BrowserEffectProject();
          project.restoreFiles(files);
          projectRef.current = project;
        }
        const seeded: ChatMsg[] = intro ? [{ role: "assistant", text: intro }, ...restored] : restored;
        setMsgs(seeded);
      } catch {
        if (!cancelled) setMsgs(intro ? [{ role: "assistant", text: intro }] : []);
      } finally {
        if (!cancelled) setLoadedTarget(targetKey);
      }
    })();
    return () => {
      cancelled = true;
    };
    // intro 仅在首次拉取时使用，之后变化属外部 prop 漂移，可忽略。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedTarget, sessionLoading, user, targetKey]);

  // 自动重放 autoPrompt：仅当历史里没有相同指令且未处于工作中。
  useEffect(() => {
    if (!hydrated || !autoPrompt || startedRef.current || sessionLoading || !user || busy) return;
    if (msgs.some((m) => m.role === "user" && sameInstruction(m.text, autoPrompt))) return;
    startedRef.current = true;
    void Promise.resolve().then(() => {
      push({ role: "user", text: autoPrompt });
      return runAgent(autoPrompt, recipe, entrySource);
    });
  }, [autoPrompt, busy, entrySource, hydrated, msgs, push, recipe, runAgent, sessionLoading, user]);

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
    push({ role: "user", text });
    void runAgent(text, recipe, entrySource);
  }, [busy, entrySource, input, push, recipe, runAgent, sessionLoading, user]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  const empty = msgs.length === 0 && !busy && hydrated;
  const visibleMsgs = useMemo(() => msgs, [msgs]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="flex h-5.5 w-5.5 items-center justify-center rounded-md bg-gradient-to-br from-bili-blue via-bili-purple to-bili-pink text-[10px] font-bold text-white">
          K
        </span>
        <span className="text-sm font-semibold text-ink">Kaleido ADE</span>
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
        <div className="space-y-4">
          {visibleMsgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-bili-pink px-3.5 py-2 text-sm text-white">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-gradient-to-br from-bili-blue via-bili-purple to-bili-pink text-[10px] font-bold text-white">
                  K
                </span>
                <div className="max-w-[85%] whitespace-pre-wrap text-sm leading-6 text-ink">
                  {m.text}
                </div>
              </div>
            ),
          )}
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
