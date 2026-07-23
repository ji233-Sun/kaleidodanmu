"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

/** 授权 scope 目录（与 server apiToken.scopes 对齐） */
const SCOPE_CATALOG: Record<string, string> = {
  "profile:read": "读取你的基本资料（昵称、头像）",
  "effects:read": "查看你的万花筒作品",
  "effects:write": "创建、修改和删除你的万花筒作品",
  "square:publish": "将作品发布到万花筒广场",
};

const DEFAULT_SCOPES = ["profile:read", "effects:read"];

/** 模拟当前登录用户（接入后端后替换为会话信息） */
const MOCK_USER = { name: "碎镜师傅", avatarHue: "#00a1d6" };

function AuthorizeForm() {
  const params = useSearchParams();
  const clientId = params.get("client_id") ?? "kaleido-cli";
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state");
  const userCode = params.get("user_code");
  const scopes = useMemo(() => {
    const raw = params.get("scope");
    const list = raw ? raw.split(/[\s,]+/).filter(Boolean) : DEFAULT_SCOPES;
    return list.length > 0 ? list : DEFAULT_SCOPES;
  }, [params]);

  const [result, setResult] = useState<{ code: string } | { denied: true } | null>(null);

  const redirect = (query: Record<string, string>) => {
    if (!redirectUri) {
      setResult(query.code ? { code: query.code } : { denied: true });
      return;
    }
    const url = new URL(redirectUri);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    window.location.href = url.toString();
  };

  const approve = () => {
    const code = `kld_mock_${Math.random().toString(36).slice(2, 18)}`;
    redirect({ code, ...(state ? { state } : {}) });
  };

  const deny = () => {
    redirect({ error: "access_denied", ...(state ? { state } : {}) });
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-6 py-10">
      <div className="w-full rounded-2xl border border-line bg-card p-6 shadow-lg">
        <div className="mb-5 flex items-center gap-2">
          <span className="h-5 w-5 rotate-45 rounded-md bg-gradient-to-br from-bili-blue via-bili-purple to-bili-pink" />
          <span className="text-sm font-bold text-ink">万花筒弹幕 · 授权</span>
          <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-3">Mock</span>
        </div>

        {result && "code" in result ? (
          <div>
            <p className="text-sm text-ink-2">
              已授权。未提供 <code className="text-bili-pink">redirect_uri</code>，请把下面的授权码粘贴回 CLI：
            </p>
            <code className="mt-3 block w-full truncate rounded-lg bg-fill px-3 py-2 text-xs text-ink select-all">
              {result.code}
            </code>
          </div>
        ) : result && "denied" in result ? (
          <p className="text-sm text-ink-2">已拒绝授权，你可以关闭此页面并返回 CLI。</p>
        ) : (
          <>
            <p className="text-sm text-ink">
              应用 <span className="font-semibold text-bili-pink">{clientId}</span>{" "}
              请求访问你的账号
            </p>
            {userCode && (
              <p className="mt-2 rounded-lg bg-fill px-3 py-2 text-xs text-ink-2">
                设备码：<code className="font-semibold text-ink">{userCode}</code>
                ，请确认与 CLI 中显示的一致
              </p>
            )}

            <div className="mt-4 rounded-xl border border-line p-3">
              <p className="mb-2 text-xs font-medium text-ink-3">请求的权限</p>
              <ul className="space-y-1.5">
                {scopes.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-xs text-ink-2">
                    <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-bili-blue" />
                    <span>
                      <code className="mr-1 text-bili-blue">{s}</code>
                      {SCOPE_CATALOG[s] ?? "（未知权限，接入后端后由服务端校验）"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl bg-fill p-3">
              <span
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: MOCK_USER.avatarHue }}
              >
                {MOCK_USER.name[0]}
              </span>
              <div className="text-xs">
                <p className="font-medium text-ink">{MOCK_USER.name}</p>
                <p className="text-ink-3">将以此账号授权</p>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={approve}
                className={cn(
                  "flex-1 rounded-lg bg-bili-pink px-4 py-2 text-sm font-medium text-white",
                  "transition-colors hover:bg-bili-pink-hover",
                )}
              >
                同意授权
              </button>
              <button
                onClick={deny}
                className="flex-1 rounded-lg bg-fill px-4 py-2 text-sm text-ink-2 transition-colors hover:text-error"
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
