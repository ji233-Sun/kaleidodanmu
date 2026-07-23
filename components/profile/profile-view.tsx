"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchDerivatives,
  fetchUserProfile,
  postInteraction,
  type DerivativeWork,
  type PublishedEffect,
  type UserProfile,
} from "@/lib/profile";
import { EffectThumb } from "@/components/effect-thumb";
import { cn } from "@/lib/cn";

function fmtNum(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function fmtDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

const HeartIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={cn("fill-current", className)}>
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  </svg>
);

const CoinIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={cn("fill-current", className)}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H12v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H9.14c.1 1.7 1.36 2.66 2.86 2.97V19h1.23v-1.71c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.65-3.38z" />
  </svg>
);

const StarIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={cn("fill-current", className)}>
    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
  </svg>
);

const ForkIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={cn("fill-current", className)}>
    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
  </svg>
);

/** 单作品上的互动状态（点赞 / 投币 / 收藏） */
interface InteractionState {
  liked: boolean;
  coined: boolean;
  favorited: boolean;
}

export function ProfileView({ name }: { name: string }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [interactions, setInteractions] = useState<Record<string, InteractionState>>({});
  /** 正在查看二创列表的作品 */
  const [derivativesOf, setDerivativesOf] = useState<PublishedEffect | null>(null);
  const [derivatives, setDerivatives] = useState<DerivativeWork[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUserProfile(name).then((p) => {
      if (cancelled) return;
      setProfile(p);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  useEffect(() => {
    if (!derivativesOf) return;
    setDerivatives(null);
    fetchDerivatives(derivativesOf.id).then(setDerivatives);
  }, [derivativesOf]);

  const interact = useCallback(
    (effect: PublishedEffect, kind: "like" | "coin" | "favorite") => {
      const key = kind === "like" ? "liked" : kind === "coin" ? "coined" : "favorited";
      const cur = interactions[effect.id]?.[key] ?? false;
      // 投币不可撤销（对齐 B 站行为）
      if (kind === "coin" && cur) return;
      const on = !cur;
      setInteractions((prev) => {
        const defaults: InteractionState = { liked: false, coined: false, favorited: false };
        return { ...prev, [effect.id]: { ...defaults, ...prev[effect.id], [key]: on } };
      });
      void postInteraction(effect.id, kind, on);
    },
    [interactions],
  );

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <div className="flex h-64 items-center justify-center text-sm text-ink-3">加载中…</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-card py-20">
          <p className="text-sm text-ink-2">用户「{name}」不存在或还没有发布作品</p>
          <Link href="/square" className="text-sm font-medium text-bili-pink hover:underline">
            去广场看看 →
          </Link>
        </div>
      </main>
    );
  }

  const stats: { label: string; value: number }[] = [
    { label: "发布", value: profile.effects.length },
    { label: "获赞", value: profile.totalLikes },
    { label: "获币", value: profile.totalCoins },
    { label: "被收藏", value: profile.totalFavorites },
    { label: "二创", value: profile.totalRemixes },
    { label: "粉丝", value: profile.followers },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      {/* 用户资料卡 */}
      <section className="mb-8 flex flex-wrap items-center gap-5 rounded-2xl border border-line bg-card p-6">
        <span
          className="flex h-16 w-16 flex-none items-center justify-center rounded-full text-2xl font-bold text-white"
          style={{ background: profile.avatarHue }}
        >
          {profile.name[0]}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-ink">{profile.name}</h1>
          <p className="mt-1 text-sm text-ink-2">{profile.bio}</p>
          <p className="mt-1 text-xs text-ink-3">{fmtDate(profile.joinedAt)} 加入</p>
        </div>
        <div className="flex flex-none flex-wrap gap-x-6 gap-y-2">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-lg font-bold text-ink">{fmtNum(s.value)}</p>
              <p className="text-xs text-ink-3">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 发布的万花筒 */}
      <h2 className="mb-4 text-lg font-semibold text-ink">
        发布的万花筒 <span className="text-sm font-normal text-ink-3">({profile.effects.length})</span>
      </h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {profile.effects.map((fx) => {
          const st = interactions[fx.id];
          const liked = st?.liked ?? false;
          const coined = st?.coined ?? false;
          const favorited = st?.favorited ?? false;
          return (
            <div
              key={fx.id}
              className="group overflow-hidden rounded-2xl border border-line bg-card transition-all hover:-translate-y-0.5 hover:border-bili-blue/40 hover:shadow-lg"
            >
              <Link href={`/square/${fx.id}`} className="block" title={`查看「${fx.name}」详情`}>
                <EffectThumb recipe={fx.recipe} seedText={fx.id} />
              </Link>
              <div className="p-4">
                <Link
                  href={`/square/${fx.id}`}
                  className="block truncate text-sm font-semibold text-ink hover:text-bili-pink"
                >
                  {fx.name}
                </Link>
                <p className="mt-1 truncate text-xs text-ink-3" title={fx.prompt}>
                  「{fx.prompt}」
                </p>
                <p className="mt-2 text-[11px] text-ink-3">发布于 {fmtDate(fx.createdAt)}</p>

                <div className="mt-3 flex items-center gap-1 border-t border-line pt-3 text-xs text-ink-3">
                  <button
                    onClick={() => interact(fx, "like")}
                    title="点赞"
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
                      liked ? "bg-bili-pink-light text-bili-pink" : "hover:bg-fill hover:text-bili-pink",
                    )}
                  >
                    <HeartIcon className="h-3.5 w-3.5" />
                    {fmtNum(fx.likes + (liked ? 1 : 0))}
                  </button>
                  <button
                    onClick={() => interact(fx, "coin")}
                    title={coined ? "已投币" : "投币"}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
                      coined ? "bg-amber-50 text-amber-500" : "hover:bg-fill hover:text-amber-500",
                    )}
                  >
                    <CoinIcon className="h-3.5 w-3.5" />
                    {fmtNum(fx.coins + (coined ? 1 : 0))}
                  </button>
                  <button
                    onClick={() => interact(fx, "favorite")}
                    title="收藏"
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
                      favorited ? "bg-bili-blue-light text-bili-blue" : "hover:bg-fill hover:text-bili-blue",
                    )}
                  >
                    <StarIcon className="h-3.5 w-3.5" />
                    {fmtNum(fx.favorites + (favorited ? 1 : 0))}
                  </button>
                  <button
                    onClick={() => setDerivativesOf(fx)}
                    title="查看二创作品"
                    className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-fill hover:text-bili-purple"
                  >
                    <ForkIcon className="h-3.5 w-3.5" />
                    {fmtNum(fx.remixes)} 二创
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 二创关联查看面板 */}
      {derivativesOf && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDerivativesOf(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">
                「{derivativesOf.name}」的二创 ({derivativesOf.remixes})
              </h3>
              <button
                onClick={() => setDerivativesOf(null)}
                className="rounded-md px-2 py-1 text-xs text-ink-3 hover:bg-fill hover:text-ink"
              >
                关闭
              </button>
            </div>
            {!derivatives ? (
              <p className="py-8 text-center text-xs text-ink-3">加载中…</p>
            ) : derivatives.length === 0 ? (
              <p className="py-8 text-center text-xs text-ink-3">还没有人基于它二创</p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {derivatives.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:border-bili-purple/40"
                  >
                    <Link
                      href={`/u/${encodeURIComponent(d.author)}`}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: d.authorAvatarHue }}
                      title={`查看 ${d.author} 的主页`}
                    >
                      {d.author[0]}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/square/${d.id}`}
                        className="block truncate text-sm font-medium text-ink hover:text-bili-pink"
                        title="查看作品详情"
                      >
                        {d.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-ink-3">
                        <Link
                          href={`/u/${encodeURIComponent(d.author)}`}
                          className="hover:text-bili-blue hover:underline"
                        >
                          {d.author}
                        </Link>
                        {" · "}
                        {fmtNum(d.likes)} 赞 · {fmtDate(d.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
