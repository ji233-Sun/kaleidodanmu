"use client";

import Link from "next/link";

interface LoginPromptProps {
  open: boolean;
  /** 被阻止的操作描述，例如「使用这个作品」「进行二次创作」 */
  action: string;
  /** 登录/注册成功后的回跳地址 */
  next: string;
  onClose: () => void;
}

/** 游客触发受限操作时的友好阻止：弹窗提醒登录或注册。 */
export function LoginPrompt({ open, action, next, onClose }: LoginPromptProps) {
  if (!open) return null;
  const href = (base: string) => `${base}?next=${encodeURIComponent(next)}`;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-ink">登录后就能{action}</h3>
        <p className="mt-2 text-sm leading-6 text-ink-2">
          注册或登录 Kaleido Danmu 账号，即可{action}，并把作品保存到云端随时使用。
        </p>
        <div className="mt-5 flex gap-2">
          <Link
            href={href("/login")}
            className="flex-1 rounded-lg bg-bili-pink px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-bili-pink-hover"
          >
            登录
          </Link>
          <Link
            href={href("/register")}
            className="flex-1 rounded-lg border border-line px-4 py-2 text-center text-sm font-medium text-ink transition-colors hover:border-bili-pink hover:text-bili-pink"
          >
            注册
          </Link>
        </div>
        <button
          onClick={onClose}
          className="mt-3 w-full text-center text-xs text-ink-3 transition-colors hover:text-ink-2"
        >
          暂不，继续逛逛
        </button>
      </div>
    </div>
  );
}
