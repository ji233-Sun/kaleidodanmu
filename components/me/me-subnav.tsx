"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/mine", label: "我的作品" },
  { href: "/me/favorites", label: "我的收藏" },
  { href: "/me/likes", label: "我的点赞" },
  { href: "/me/following", label: "我的关注" },
];

/** 「我的」二级导航：作品 / 收藏 / 点赞 / 关注。 */
export function MeSubnav({ active }: { active: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-line">
      {TABS.map((t) => {
        const on = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm transition-colors",
              on
                ? "border-bili-pink font-medium text-bili-pink"
                : "border-transparent text-ink-2 hover:text-bili-pink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
