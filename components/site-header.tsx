"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

const LINKS = [
  { href: "/", label: "创作" },
  { href: "/mine", label: "我的万花筒" },
  { href: "/square", label: "万花筒广场" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useSession();

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-card/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="h-5 w-5 rotate-45 rounded-md bg-gradient-to-br from-bili-blue via-bili-purple to-bili-pink shadow-[0_0_14px_rgba(124,92,252,.5)]" />
          <span className="text-lg font-bold tracking-tight text-ink">万花筒弹幕</span>
          <span className="hidden text-xs font-medium text-ink-3 sm:inline">KALEIDO</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 transition-colors",
                  active ? "bg-bili-pink-light font-medium text-bili-pink" : "text-ink-2 hover:text-bili-pink",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {loading ? null : user ? (
            <>
              <Link
                href="/settings"
                className={cn(
                  "rounded-lg px-3 py-1.5 transition-colors",
                  pathname.startsWith("/settings")
                    ? "bg-bili-pink-light font-medium text-bili-pink"
                    : "text-ink-2 hover:text-bili-pink",
                )}
              >
                设置
              </Link>
              <span className="hidden max-w-40 truncate text-xs text-ink-3 sm:inline" title={user.email}>
                {user.email}
              </span>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-2 transition-colors hover:border-bili-pink hover:text-bili-pink"
              >
                退出
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-1.5 text-ink-2 transition-colors hover:text-bili-pink"
              >
                登录
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-bili-pink px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-bili-pink-hover"
              >
                注册
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
