"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session";
import { AuthForm } from "@/components/auth/auth-form";
import { Spinner } from "@/components/ui";

/** 仅允许站内相对路径，防止开放重定向 */
function safeNext(raw: string | null): string | undefined {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return undefined;
}

function RegisterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { user, loading } = useSession();

  // 已登录用户直接跳走，不展示注册框
  useEffect(() => {
    if (!loading && user) router.replace(next ?? "/mine");
  }, [loading, user, next, router]);

  if (loading || user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-10">
      <h1 className="text-2xl font-bold text-ink">注册</h1>
      <p className="mt-1 mb-6 text-sm text-ink-2">
        创建一个账号，保存并分享你的 Canvas 作品。
      </p>
      <div className="rounded-2xl border border-line bg-card p-6">
        <AuthForm mode="register" next={next} />
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <Spinner />
        </main>
      }
    >
      <RegisterInner />
    </Suspense>
  );
}
