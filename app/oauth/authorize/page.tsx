"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Spinner } from "@/components/ui";
import { CLI_CLIENT_ID, SCOPE_CATALOG, DEFAULT_CLI_SCOPES, type AuthorizeResponse } from "@/types";

function AuthorizeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading } = useSession();

  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge") ?? "";
  const codeChallengeMethod = params.get("code_challenge_method") ?? "";
  const scopes = useMemo(() => {
    const raw = params.get("scope");
    const list = raw ? raw.split(/[\s,]+/).filter(Boolean) : DEFAULT_CLI_SCOPES;
    return list.length > 0 ? list : DEFAULT_CLI_SCOPES;
  }, [params]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 参数完整性检查：缺任何一个都无法安全地走授权码流程
  const paramError = useMemo(() => {
    if (clientId !== CLI_CLIENT_ID) return `未知的 client_id：${clientId || "（缺失）"}`;
    if (!redirectUri) return "缺少 redirect_uri 参数";
    if (!codeChallenge || codeChallengeMethod !== "S256") return "缺少 PKCE 参数（code_challenge / S256）";
    const unknown = scopes.filter((s) => !(s in SCOPE_CATALOG));
    if (unknown.length > 0) return `未知权限：${unknown.join(", ")}`;
    return null;
  }, [clientId, redirectUri, codeChallenge, codeChallengeMethod, scopes]);

  // 未登录 → 带去登录页，登录后回跳到本授权页
  useEffect(() => {
    if (loading || user || paramError) return;
    const next = `/oauth/authorize?${params.toString()}`;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [loading, user, paramError, params, router]);

  const redirect = (query: Record<string, string>) => {
    const url = new URL(redirectUri);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    window.location.href = url.toString();
  };

  const approve = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { code } = await apiFetch<AuthorizeResponse>("/api/oauth/authorize", {
        method: "POST",
        json: {
          clientId,
          redirectUri,
          scopes,
          codeChallenge,
          codeChallengeMethod: "S256",
        },
      });
      redirect({ code, ...(state ? { state } : {}) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "授权失败，请稍后重试");
      setSubmitting(false);
    }
  };

  const deny = () => {
    redirect({ error: "access_denied", ...(state ? { state } : {}) });
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-6 py-10">
      <div className="w-full rounded-2xl border border-line bg-card p-6 shadow-lg">
        <div className="mb-5 flex items-center gap-2">
          <span className="h-5 w-5 rotate-45 rounded-md bg-gradient-to-br from-bili-blue via-bili-purple to-bili-pink" />
          <span className="text-sm font-bold text-ink">自由 Canvas · 授权</span>
        </div>

        {paramError ? (
          <p className="text-sm text-error">
            授权请求无效：{paramError}。请从 CLI 重新发起 <code>kdanmu login</code>。
          </p>
        ) : loading || !user ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <p className="text-sm text-ink">
              应用 <span className="font-semibold text-bili-pink">{clientId}</span>{" "}
              请求访问你的账号
            </p>

            <div className="mt-4 rounded-xl border border-line p-3">
              <p className="mb-2 text-xs font-medium text-ink-3">请求的权限</p>
              <ul className="space-y-1.5">
                {scopes.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-xs text-ink-2">
                    <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-bili-blue" />
                    <span>
                      <code className="mr-1 text-bili-blue">{s}</code>
                      {SCOPE_CATALOG[s]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl bg-fill p-3">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-bili-blue text-xs font-bold text-white">
                {user.email[0].toUpperCase()}
              </span>
              <div className="text-xs">
                <p className="font-medium text-ink">{user.email}</p>
                <p className="text-ink-3">将以此账号授权</p>
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-error">{error}</p>}

            <div className="mt-5 flex gap-3">
              <button
                onClick={approve}
                disabled={submitting}
                className={cn(
                  "flex-1 rounded-lg bg-bili-pink px-4 py-2 text-sm font-medium text-white",
                  "transition-colors hover:bg-bili-pink-hover disabled:opacity-60",
                )}
              >
                {submitting ? "授权中…" : "同意授权"}
              </button>
              <button
                onClick={deny}
                disabled={submitting}
                className="flex-1 rounded-lg bg-fill px-4 py-2 text-sm text-ink-2 transition-colors hover:text-error disabled:opacity-60"
              >
                拒绝
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense>
      <AuthorizeForm />
    </Suspense>
  );
}
