"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchMyFollowing } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { MeSubnav } from "@/components/me/me-subnav";
import type { PublicUserDto } from "@/types";

export default function FollowingPage() {
  const { user, loading } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<PublicUserDto[] | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/me/following");
  }, [loading, user, router]);
  useEffect(() => {
    if (!user) return;
    fetchMyFollowing()
      .then(setItems)
      .catch(() => setItems([]));
  }, [user]);

  if (!user) return null;
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <MeSubnav active="/me/following" />
      <h1 className="mb-4 text-lg font-semibold text-ink">我的关注</h1>
      {items === null ? (
        <p className="py-20 text-center text-sm text-ink-3">加载中…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-card py-20 text-center text-sm text-ink-3">
          还没有关注任何人
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((u) => (
            <li key={u.id}>
              <Link
                href={`/u/${encodeURIComponent(u.name)}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 transition-colors hover:border-bili-pink/40"
              >
                <span
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: u.avatarHue }}
                >
                  {u.displayName[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{u.displayName}</span>
                  <span className="block truncate text-xs text-ink-3">@{u.name}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
