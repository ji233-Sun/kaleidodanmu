"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMyReactions, type PublishedEffect } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { MeSubnav } from "@/components/me/me-subnav";
import { MyEffectGrid } from "@/components/me/my-effect-grid";

export default function FavoritesPage() {
  const { user, loading } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<PublishedEffect[] | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/me/favorites");
  }, [loading, user, router]);
  useEffect(() => {
    if (!user) return;
    fetchMyReactions("favorite")
      .then(setItems)
      .catch(() => setItems([]));
  }, [user]);

  if (!user) return null;
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <MeSubnav active="/me/favorites" />
      <h1 className="mb-4 text-lg font-semibold text-ink">我的收藏</h1>
      {items === null ? (
        <p className="py-20 text-center text-sm text-ink-3">加载中…</p>
      ) : (
        <MyEffectGrid items={items} emptyText="还没有收藏任何作品，去广场看看吧" />
      )}
    </main>
  );
}
