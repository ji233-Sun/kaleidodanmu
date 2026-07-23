"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/", label: "创作" },
  { href: "/mine", label: "我的万花筒" },
  { href: "/square", label: "万花筒广场" },
  // mock 当前登录用户的主页，接入后端后替换为会话用户
  { href: "/u/碎镜师傅", label: "个人主页" },
];

export function SiteHeader() {
  const pathname = usePathname();
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
              l.href === "/"
                ? pathname === "/"
                : l.href.startsWith("/u/")
                  ? pathname.startsWith("/u/")
                  : pathname.startsWith(l.href);
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
        <div className="ml-auto flex items-center gap-2 text-xs text-ink-3">
          <span className="hidden rounded-full border border-line px-2.5 py-1 sm:inline">原型 · Mock 数据</span>
        </div>
      </div>
    </header>
  );
}
