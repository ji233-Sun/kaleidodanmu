"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/cn";
import type {
  ApiTokenDto,
  AppSettingDto,
  CreatedApiTokenDto,
  TokenListResponse,
} from "@/types";
import { Alert, Badge, Button, Input, Spinner, Tabs } from "@/components/ui";

/** 授权 scope 目录（与 app/oauth/authorize/page.tsx 的 SCOPE_CATALOG 对齐） */
const SCOPE_CATALOG: Record<string, string> = {
  "profile:read": "读取你的基本资料（昵称、头像）",
  "effects:read": "查看你的 Canvas 作品",
  "effects:write": "创建、修改和删除你的 Canvas 作品",
  "square:publish": "将作品发布到创作广场",
};

const EXPIRES_OPTIONS: { label: string; days?: number }[] = [
  { label: "7 天", days: 7 },
  { label: "30 天", days: 30 },
  { label: "90 天", days: 90 },
  { label: "365 天", days: 365 },
  { label: "永不过期" },
];

/** ISO 时间串 → 「YYYY-MM-DD HH:mm」 */
function fmtTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function errMessage(e: unknown) {
  return e instanceof ApiError ? e.message : "请求失败，请稍后重试";
}

/* ------------------------------ API Token 页签 ------------------------------ */

function TokenPanel() {
  const [tokens, setTokens] = useState<ApiTokenDto[] | null>(null);
  /** 列表加载完成的时间点，用于判定 token 是否过期（避免渲染期调用 Date.now） */
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [picked, setPicked] = useState<Set<string>>(new Set(["profile:read"]));
  const [expiresIdx, setExpiresIdx] = useState(1);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedApiTokenDto | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<TokenListResponse>("/api/tokens");
      setTokens(data.tokens);
      setLoadedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(errMessage(e));
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

  const toggleScope = (scope: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  const create = async () => {
    if (picked.size === 0 || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const days = EXPIRES_OPTIONS[expiresIdx].days;
      const { token } = await apiFetch<{ token: CreatedApiTokenDto }>("/api/tokens", {
        method: "POST",
        json: { scopes: [...picked], ...(days ? { expiresInDays: days } : {}) },
      });
      setCreated(token);
      setCopied(false);
      void load();
    } catch (e) {
      setCreateError(errMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
    } catch {
      // 剪贴板不可用时退化为手动选择复制
      setCopied(false);
    }
  };

  const revoke = async (t: ApiTokenDto) => {
    if (revokingId !== null) return;
    if (!window.confirm(`确定吊销 Token #${t.id} 吗？吊销后使用它的应用将立即失效。`)) return;
    setRevokingId(t.id);
    setError(null);
    try {
      await apiFetch(`/api/tokens/${t.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {created && (
        <div className="rounded-2xl border border-success/40 bg-success-light p-5">
          <p className="text-sm font-semibold text-success">Token 创建成功</p>
          <p className="mt-1 text-xs text-ink-2">
            明文 Token 仅此一次展示，请立即复制并妥善保存。
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink select-all">
              {created.token}
            </code>
            <Button size="sm" variant={copied ? "secondary" : "primary"} onClick={copy}>
              {copied ? "已复制" : "复制"}
            </Button>
          </div>
          <button
            onClick={() => setCreated(null)}
            className="mt-3 text-xs text-ink-3 hover:text-ink-2"
          >
            我已保存，关闭提示
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-sm font-semibold text-ink">新建 Token</h2>
        <p className="mt-1 text-xs text-ink-3">选择该 Token 可访问的权限范围和有效期。</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(SCOPE_CATALOG).map(([scope, desc]) => {
            const on = picked.has(scope);
            return (
              <button
                key={scope}
                type="button"
                title={desc}
                onClick={() => toggleScope(scope)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors cursor-pointer",
                  on
                    ? "border-bili-pink bg-bili-pink-light text-bili-pink"
                    : "border-line bg-white text-ink-2 hover:border-ink-3",
                )}
              >
                {scope}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {[...picked].map((s) => SCOPE_CATALOG[s] ?? s).join("；") || "尚未选择权限"}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={expiresIdx}
            onChange={(e) => setExpiresIdx(Number(e.target.value))}
            className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink transition-colors hover:border-ink-3 focus:border-bili-pink focus:outline-none"
          >
            {EXPIRES_OPTIONS.map((opt, i) => (
              <option key={opt.label} value={i}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button onClick={create} disabled={picked.size === 0 || creating}>
            {creating ? "创建中…" : "创建 Token"}
          </Button>
          {picked.size === 0 && (
            <span className="text-xs text-ink-3">请至少选择一个权限</span>
          )}
        </div>
        {createError && (
          <Alert hue="red" title="创建失败" className="mt-4">
            {createError}
          </Alert>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">已有 Token</h2>
        {error && (
          <Alert hue="red" title="加载失败" className="mb-3">
            {error}
          </Alert>
        )}
        {tokens === null ? (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-6 text-sm text-ink-3">
            <Spinner size={20} /> 加载中…
          </div>
        ) : tokens.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-8 text-center text-sm text-ink-3">
            还没有 Token，先在上方创建一个吧
          </div>
        ) : (
          <ul className="space-y-3">
            {tokens.map((t) => {
              const revoked = t.revokedAt !== null;
              const expired = t.expiresAt !== null && new Date(t.expiresAt).getTime() < loadedAt;
              return (
                <li
                  key={t.id}
                  className={cn(
                    "rounded-2xl border border-line bg-card p-4",
                    revoked && "opacity-50",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">Token #{t.id}</span>
                    {revoked ? (
                      <Badge hue="red">已吊销</Badge>
                    ) : expired ? (
                      <Badge hue="orange">已过期</Badge>
                    ) : (
                      <Badge hue="green">有效</Badge>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {!revoked && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="hover:bg-error-light hover:text-error"
                          disabled={revokingId === t.id}
                          onClick={() => revoke(t)}
                        >
                          {revokingId === t.id ? "吊销中…" : "吊销"}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.scopes.map((s) => (
                      <Badge key={s} hue="blue" title={SCOPE_CATALOG[s]}>
                        {s}
                      </Badge>
                    ))}
                    {t.scopes.length === 0 && (
                      <span className="text-xs text-ink-3">无权限范围</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-ink-3">
                    创建于 {fmtTime(t.createdAt)}
                    {" · "}
                    {t.expiresAt ? `${fmtTime(t.expiresAt)} 过期` : "永不过期"}
                    {revoked && ` · 吊销于 ${fmtTime(t.revokedAt!)}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------ 应用设置页签 ------------------------------ */

function SettingRow({ setting }: { setting: AppSettingDto }) {
  const [value, setValue] = useState(setting.value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = value !== setting.value;

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch<{ setting: AppSettingDto }>(`/api/settings/${encodeURIComponent(setting.key)}`, {
        method: "PUT",
        json: { value },
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <code className="w-48 flex-none text-xs font-semibold text-ink">{setting.key}</code>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Button
          size="sm"
          variant={saved ? "secondary" : "primary"}
          disabled={saving || (!dirty && !saved)}
          onClick={save}
          className="w-20 flex-none"
        >
          {saving ? "保存中" : saved ? "已保存" : "保存"}
        </Button>
      </div>
      {error && (
        <Alert hue="red" title="保存失败" className="mt-3">
          {error}
        </Alert>
      )}
    </li>
  );
}

function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ settings: AppSettingDto[] }>("/api/settings")
      .then((data) => {
        if (!cancelled) setSettings(data.settings);
      })
      .catch((e) => {
        if (!cancelled) setError(errMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <p className="mb-3 text-xs text-ink-3">
        以下为平台级配置，修改后对全站生效，请谨慎操作。
      </p>
      {error && (
        <Alert hue="red" title="加载失败" className="mb-3">
          {error}
        </Alert>
      )}
      {settings === null ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-6 text-sm text-ink-3">
          <Spinner size={20} /> 加载中…
        </div>
      ) : settings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card p-8 text-center text-sm text-ink-3">
          暂无平台配置项
        </div>
      ) : (
        <ul className="space-y-3">
          {settings.map((s) => (
            <SettingRow key={s.key} setting={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------- 页面 --------------------------------- */

export default function SettingsPage() {
  const { user, loading } = useSession();

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-6 py-8">
        <Spinner />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-card py-20">
          <span className="h-8 w-8 rotate-45 rounded-lg bg-gradient-to-br from-bili-blue via-bili-purple to-bili-pink opacity-60" />
          <p className="text-sm text-ink-2">登录后才能管理设置</p>
          <Link href="/login?next=/settings">
            <Button size="sm">去登录</Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">设置</h1>
        <p className="mt-1 text-sm text-ink-2">管理你的 API Token 和平台应用配置。</p>
      </div>
      <Tabs
        defaultValue="tokens"
        items={[
          { value: "tokens", label: "API Token", content: <TokenPanel /> },
          { value: "settings", label: "应用设置", content: <SettingsPanel /> },
        ]}
      />
    </main>
  );
}
