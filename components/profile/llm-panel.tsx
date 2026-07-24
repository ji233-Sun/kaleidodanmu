"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { LLM_DEFAULT_BASE_URLS, type LlmConfigDto, type LlmProvider, type ThinkingLevel } from "@/types";
import { Alert, Badge, Button, Input, Spinner } from "@/components/ui";

function errMessage(e: unknown) {
  return e instanceof ApiError ? e.message : "请求失败，请稍后重试";
}

const PROVIDER_OPTIONS: { value: LlmProvider; label: string; desc: string }[] = [
  {
    value: "openai-chat",
    label: "OpenAI Chat Completions",
    desc: "OpenAI 及兼容服务（DeepSeek、Moonshot 等）的 /chat/completions 接口",
  },
  {
    value: "openai-responses",
    label: "OpenAI Responses",
    desc: "OpenAI 新一代 /responses 接口",
  },
  {
    value: "anthropic",
    label: "Anthropic Messages",
    desc: "Claude 的 /v1/messages 接口",
  },
];

/** '' = 默认：不向上游发送思考参数，跟随模型自身行为 */
const THINKING_OPTIONS: { value: ThinkingLevel | ""; label: string }[] = [
  { value: "", label: "默认" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];

/** 设置页「模型」页签：用户自带 LLM 配置（BYOK）。 */
export function LlmPanel() {
  /** null = 加载中；否则为已保存配置（无配置时为 null 由 savedLoaded 区分） */
  const [saved, setSaved] = useState<LlmConfigDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [provider, setProvider] = useState<LlmProvider>("openai-chat");
  const [baseUrl, setBaseUrl] = useState<string>(LLM_DEFAULT_BASE_URLS["openai-chat"]);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [thinking, setThinking] = useState<ThinkingLevel | "">("");

  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ config: LlmConfigDto | null }>("/api/user/llm-config");
      setSaved(data.config);
      if (data.config) {
        setProvider(data.config.provider);
        setBaseUrl(data.config.baseUrl);
        setModel(data.config.model);
        setThinking(data.config.thinking ?? "");
        setApiKey("");
      }
      setLoadError(null);
    } catch (e) {
      setLoadError(errMessage(e));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const pickProvider = (p: LlmProvider) => {
    setProvider(p);
    // 切换协议时预填对应默认上游地址，仍可手改
    setBaseUrl(LLM_DEFAULT_BASE_URLS[p]);
    setTestResult(null);
  };

  const save = async () => {
    // 已保存过 key 时留空表示保持不变；首次保存必须输入
    if (saving || !model.trim() || (!saved && !apiKey.trim())) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { config } = await apiFetch<{ config: LlmConfigDto }>("/api/user/llm-config", {
        method: "PUT",
        json: { provider, baseUrl, apiKey: apiKey.trim(), model: model.trim(), ...(thinking ? { thinking } : {}) },
      });
      setSaved(config);
      setApiKey("");
      setNotice("已保存，Kaleido Danmu Agent 将使用你的模型");
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (removing) return;
    if (!window.confirm("确定删除自带模型配置吗？Kaleido Danmu Agent 将回退到平台内置模型。")) return;
    setRemoving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch("/api/user/llm-config", { method: "DELETE" });
      setSaved(null);
      setApiKey("");
      setTestResult(null);
      setNotice("已恢复平台内置模型");
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setRemoving(false);
    }
  };

  const test = async () => {
    if (testing || !model.trim()) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const result = await apiFetch<{ ok: boolean; message?: string }>("/api/user/llm-config/test", {
        method: "POST",
        json: { provider, baseUrl, apiKey: apiKey.trim(), model: model.trim() },
      });
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, message: errMessage(e) });
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-6 text-sm text-ink-3">
        <Spinner size={20} /> 加载中…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">Kaleido Danmu Agent 模型</h2>
          {saved ? <Badge hue="green">自带模型</Badge> : <Badge hue="blue">平台内置</Badge>}
        </div>
        <p className="mt-1 text-xs text-ink-3">
          配置你自己的 LLM（BYOK），Studio 的 Kaleido Danmu Agent 将优先使用它；未配置时使用平台内置模型。
          API Key 加密存储在服务端，仅用于代理转发，不会回传给页面。
        </p>

        {loadError && (
          <Alert hue="red" title="加载失败" className="mt-4">
            {loadError}
          </Alert>
        )}

        <div className="mt-4 space-y-2">
          {PROVIDER_OPTIONS.map((opt) => {
            const on = provider === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => pickProvider(opt.value)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer",
                  on ? "border-bili-pink bg-bili-pink-light" : "border-line bg-white hover:border-ink-3",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 h-4 w-4 flex-none rounded-full border-4 transition-colors",
                    on ? "border-bili-pink bg-white" : "border-line bg-white",
                  )}
                />
                <span>
                  <span className={cn("block text-sm", on ? "font-semibold text-bili-pink" : "text-ink")}>
                    {opt.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-3">{opt.desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink-2">Base URL</span>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={LLM_DEFAULT_BASE_URLS[provider]} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink-2">API Key</span>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={saved ? `已保存 ${saved.apiKeyPreview}，留空则保持不变` : "sk-..."}
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink-2">模型</span>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="如 gpt-4o-mini / claude-sonnet-4-5" />
          </label>
          <div>
            <span className="mb-1 block text-xs font-semibold text-ink-2">思考深度</span>
            <div className="flex flex-wrap gap-2">
              {THINKING_OPTIONS.map((opt) => {
                const on = thinking === opt.value;
                return (
                  <button
                    key={opt.value || "default"}
                    type="button"
                    onClick={() => setThinking(opt.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors cursor-pointer",
                      on ? "border-bili-pink bg-bili-pink-light font-semibold text-bili-pink" : "border-line bg-white text-ink-2 hover:border-ink-3",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-ink-3">
              默认不发送思考参数；低/中/高会按协议映射为 reasoning_effort / reasoning.effort / thinking.budget_tokens，模型不支持时请勿开启。
            </p>
          </div>
        </div>

        {error && (
          <Alert hue="red" title="操作失败" className="mt-4">
            {error}
          </Alert>
        )}
        {notice && (
          <Alert hue="green" title="完成" className="mt-4">
            {notice}
          </Alert>
        )}
        {testResult && (
          <Alert hue={testResult.ok ? "green" : "red"} title={testResult.ok ? "连接成功" : "连接失败"} className="mt-4">
            {testResult.ok ? "上游服务可达，密钥与模型可用。" : (testResult.message ?? "未知错误")}
          </Alert>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={test} disabled={testing || !model.trim()}>
            {testing ? "测试中…" : "测试连接"}
          </Button>
          <Button onClick={save} disabled={saving || !model.trim() || (!saved && !apiKey.trim())}>
            {saving ? "保存中…" : "保存"}
          </Button>
          {saved && (
            <Button
              variant="ghost"
              className="hover:bg-error-light hover:text-error"
              onClick={remove}
              disabled={removing}
            >
              {removing ? "删除中…" : "恢复平台内置"}
            </Button>
          )}
          {!saved && !apiKey.trim() && (
            <span className="text-xs text-ink-3">首次保存需输入 API Key；之后留空则保持已保存的 Key</span>
          )}
        </div>
      </section>
    </div>
  );
}
