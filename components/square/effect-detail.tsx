"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fetchDerivatives,
  fetchSquareEffect,
  postInteraction,
  type DerivativeWork,
  type PublishedEffect,
} from "@/lib/profile";
import { newEffectId, upsertEffect } from "@/lib/store";
import { hashString } from "@/lib/random";
import { KaleidoPlayer } from "@/components/player/kaleido-player";
import { Badge, Button, Spinner } from "@/components/ui";
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

export function EffectDetail({ id }: { id: string }) {
  const router = useRouter();
  const [effect, setEffect] = useState<PublishedEffect | null>(null);
  const [loading, setLoading] = useState(true);
  const [derivatives, setDerivatives] = useState<DerivativeWork[] | null>(null);
  const [used, setUsed] = useState(false);
  const [liked, setLiked] = useState(false);
  const [coined, setCoined] = useState(false);
  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    // 组件以 key=id remount（见 app/square/[id]/page.tsx），effect 内只做异步拉取
    let cancelled = false;
    fetchSquareEffect(id).then((fx) => {
      if (cancelled) return;
      setEffect(fx);
      setLoading(false);
      if (fx) fetchDerivatives(fx.id).then((list) => !cancelled && setDerivatives(list));
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  /** 一键取用：复制作品（与广场卡片行为一致）。 */
  const use = useCallback(() => {
    if (!effect) return;
    upsertEffect({
      id: newEffectId(),
      name: effect.name,
      prompt: effect.prompt,
      recipe: { ...effect.recipe, palette: [...effect.recipe.palette] },
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      forkedFrom: effect.id,
    });
    setUsed(true);
  }, [effect]);

  /** 点赞 / 投币 / 收藏：乐观更新（投币不可撤销，对齐 B 站行为） */
  const interact = useCallback(
    (kind: "like" | "coin" | "favorite") => {
      if (!effect) return;
      const cur = kind === "like" ? liked : kind === "coin" ? coined : favorited;
      if (kind === "coin" && cur) return;
      const on = !cur;
      if (kind === "like") setLiked(on);
      else if (kind === "coin") setCoined(on);
      else setFavorited(on);
      void postInteraction(effect.id, kind, on);
    },
    [effect, liked, coined, favorited],
  );

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <Spinner />
          <p className="text-sm text-ink-3">加载作品中…</p>
        </div>
      </main>
    );
  }

  if (!effect) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-card py-20">
          <p className="text-sm text-ink-2">作品不存在或已下架</p>
          <Link href="/square" className="text-sm font-medium text-bili-pink hover:underline">
            返回广场 →
          </Link>
        </div>
      </main>
    );
  }

  const interactions: {
    kind: "like" | "coin" | "favorite";
    label: string;
    count: number;
    active: boolean;
    activeCls: string;
    icon: React.ReactNode;
  }[] = [
    {
      kind: "like",
      label: "点赞",
      count: effect.likes + (liked ? 1 : 0),
      active: liked,
      activeCls: "bg-bili-pink-light text-bili-pink",
      icon: <HeartIcon className="h-4 w-4" />,
    },
    {
      kind: "coin",
      label: "投币",
      count: effect.coins + (coined ? 1 : 0),
      active: coined,
      activeCls: "bg-bili-blue-light text-bili-blue",
      icon: <CoinIcon className="h-4 w-4" />,
    },
    {
      kind: "favorite",
      label: "收藏",
      count: effect.favorites + (favorited ? 1 : 0),
      active: favorited,
      activeCls: "bg-bili-purple-light text-bili-purple",
      icon: <StarIcon className="h-4 w-4" />,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* 左栏：预览 + 二创列表 */}
        <div className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-line">
            <KaleidoPlayer recipe={effect.recipe} seed={hashString(effect.id)} title={effect.name} />
          </div>

          {/* 二创列表 */}
          <section className="mt-8">
            <h2 className="mb-4 text-lg font-semibold text-ink">
              二创作品 <span className="text-sm font-normal text-ink-3">({effect.remixes})</span>
            </h2>
            {!derivatives ? (
              <div className="flex items-center gap-2 py-8 text-sm text-ink-3">
                <Spinner size={20} /> 加载中…
              </div>
            ) : derivatives.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line bg-card py-10 text-center text-sm text-ink-3">
                还没有二创，来当第一个 →
              </p>
            ) : (
              <ul className="space-y-2">
                {derivatives.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/square/${d.id}`}
                      className="flex items-center gap-3 rounded-xl border border-line bg-card p-3 transition-colors hover:border-bili-purple/40"
                    >
                      <span
                        className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ background: d.authorAvatarHue }}
                      >
                        {d.author[0]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{d.name}</p>
                        <p className="mt-0.5 truncate text-xs text-ink-3">
                          {d.author} · {fmtNum(d.likes)} 赞 · {fmtDate(d.createdAt)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* 右栏：信息与操作 */}
        <aside className="min-w-0 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-ink">{effect.name}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {effect.tags.map((t) => (
                <Badge key={t} hue="blue">
                  {t}
                </Badge>
              ))}
            </div>
            <p className="mt-3 rounded-xl bg-fill p-3 text-sm text-ink-2">「{effect.prompt}」</p>
          </div>

          {/* 作者卡片 */}
          <Link
            href={`/u/${encodeURIComponent(effect.author)}`}
            className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 transition-colors hover:border-bili-pink/40"
          >
            <span
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-base font-bold text-white"
              style={{ background: effect.authorAvatarHue }}
            >
              {effect.author[0]}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{effect.author}</p>
              <p className="mt-0.5 text-xs text-ink-3">发布于 {fmtDate(effect.createdAt)}</p>
            </div>
            <span className="ml-auto flex-none text-xs text-bili-pink">主页 →</span>
          </Link>

          {/* 互动 */}
          <div className="flex gap-2">
            {interactions.map((it) => (
              <button
                key={it.kind}
                onClick={() => interact(it.kind)}
                title={it.label}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-xl border border-line bg-card py-3 text-ink-3 transition-colors",
                  it.active ? cn("border-transparent", it.activeCls) : "hover:bg-fill",
                )}
              >
                {it.icon}
                <span className="text-xs font-medium">{fmtNum(it.count)}</span>
                <span className="text-[10px]">{it.label}</span>
              </button>
            ))}
          </div>

          {/* 统计 */}
          <div className="flex gap-4 rounded-xl border border-line bg-card px-4 py-3 text-xs text-ink-3">
            <span>{fmtNum(effect.uses)} 次使用</span>
            <span>{fmtNum(effect.remixes)} 次二创</span>
          </div>

          {/* 操作 */}
          <div className="flex gap-2">
            <Button
              onClick={use}
              variant={used ? "secondary" : "primary"}
              className={cn("flex-1", used && "pointer-events-none border-transparent bg-success-light text-success")}
            >
              {used ? "✓ 已取用到我的作品" : "使用"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => router.push(`/studio?fork=${effect.id}`)}>
              二创
            </Button>
          </div>
        </aside>
      </div>
    </main>
  );
}
