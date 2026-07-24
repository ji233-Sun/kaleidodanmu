"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AuthUserDto } from "@/types";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Alert, Button, Input, Spinner } from "@/components/ui";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const NAME_MIN = 3;
const NAME_MAX = 20;

/** 归一化为合法 handle：小写字母/数字/连字符，最长 20 位 */
const sanitizeHandle = (raw: string): string =>
  raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, NAME_MAX);

export interface AuthFormProps {
  mode: "login" | "register";
  /** 登录成功后的跳转目标（仅允许站内路径），缺省 /mine */
  next?: string;
}

/** 登录 / 注册共用表单：本地校验 + 提交 + 会话刷新后跳转 */
export function AuthForm({ mode, next }: AuthFormProps) {
  const router = useRouter();
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isLogin = mode === "login";

  // 注册时，未手动编辑用户名则根据邮箱本地部分自动预填
  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (!isLogin && !nameTouched) {
      setName(sanitizeHandle(value.split("@")[0] ?? ""));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // 前端先本地校验，失败不发请求
    const trimmed = email.trim();
    if (!trimmed) {
      setError("请输入邮箱");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("邮箱格式不正确");
      return;
    }
    const trimmedName = name.trim();
    if (!isLogin && !/^[a-z0-9-]{3,20}$/.test(trimmedName)) {
      setError(`用户名需为 ${NAME_MIN}~${NAME_MAX} 位小写字母、数字或连字符`);
      return;
    }
    if (password.length < PASSWORD_MIN) {
      setError(`密码至少需要 ${PASSWORD_MIN} 位`);
      return;
    }
    if (password.length > PASSWORD_MAX) {
      setError(`密码不能超过 ${PASSWORD_MAX} 位`);
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      await apiFetch<{ user: AuthUserDto }>(`/api/auth/${mode}`, {
        method: "POST",
        json: isLogin
          ? { email: trimmed, password }
          : { email: trimmed, password, name: trimmedName },
      });
      await refresh();
      router.push(next ?? "/mine");
    } catch (err) {
      if (err instanceof ApiError) {
        const friendly: Record<string, string> = {
          email_taken: "该邮箱已被注册",
          name_taken: "该用户名已被占用，请换一个",
        };
        setError(friendly[err.code] ?? err.message);
      } else {
        setError("网络异常，请稍后重试");
      }
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert hue="red" title={error} />}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">邮箱</span>
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => handleEmailChange(e.target.value)}
          disabled={submitting}
        />
      </label>

      {!isLogin && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">用户名</span>
          <Input
            type="text"
            autoComplete="username"
            placeholder="your-name"
            value={name}
            onChange={(e) => {
              setNameTouched(true);
              setName(sanitizeHandle(e.target.value));
            }}
            disabled={submitting}
          />
          <span className="text-xs text-ink-3">
            {NAME_MIN}~{NAME_MAX} 位小写字母、数字或连字符，将作为你的主页地址
          </span>
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">密码</span>
        <Input
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          placeholder={`${PASSWORD_MIN}~${PASSWORD_MAX} 位字符`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />
      </label>

      <Button type="submit" size="lg" className="mt-1 w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Spinner size={16} />
            {isLogin ? "登录中…" : "注册中…"}
          </>
        ) : isLogin ? (
          "登录"
        ) : (
          "注册"
        )}
      </Button>

      <p className="text-center text-sm text-ink-3">
        {isLogin ? (
          <>
            没有账号？
            <Link
              href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
              className="font-medium text-bili-pink hover:underline"
            >
              去注册
            </Link>
          </>
        ) : (
          <>
            已有账号？
            <Link
              href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
              className="font-medium text-bili-pink hover:underline"
            >
              去登录
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
