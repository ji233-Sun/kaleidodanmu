"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

const LINKS = [
  { href: "/", label: "创作" },
  { href: "/mine", label: "我的作品" },
  { href: "/square", label: "创作广场" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const runtimePage = pathname === "/effect-runtime";
  const { user, loading, logout } = useSession(!runtimePage);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  if (runtimePage) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:h-14 sm:flex-nowrap sm:gap-8 sm:px-6 sm:py-0">
        <Link href="/" className="flex min-w-0 items-center gap-2 whitespace-nowrap">
          {/* eslint-disable-next-line @next/next/no-img-element -- 品牌图标，用原生 img 避免 SVG 走 next/image 配置 */}
          <img src="/logo.svg" alt="Kaleido Danmu" className="h-6 w-6 shrink-0" />
          <span className="text-lg font-bold tracking-tight text-ink">Kaleido Danmu</span>
        </Link>
        <nav className="order-3 flex w-full items-center justify-center gap-1 text-sm sm:order-0 sm:w-auto sm:justify-start">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 transition-colors sm:px-3",
                  active ? "bg-bili-pink-light font-medium text-bili-pink" : "text-ink-2 hover:text-bili-pink",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex flex-none items-center gap-1 text-sm sm:gap-2">
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
              <Link
                href={`/u/${encodeURIComponent(user.name)}`}
                className="hidden max-w-40 truncate text-xs text-ink-3 hover:text-bili-pink sm:inline"
                title={user.email}
              >
                {user.displayName}
              </Link>
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
