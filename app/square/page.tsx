"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SQUARE_ITEMS } from "@/lib/square";
import { newEffectId, upsertEffect } from "@/lib/store";
import { EffectThumb } from "@/components/effect-thumb";
import { cn } from "@/lib/cn";

function fmtNum(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function SquarePage() {
  const router = useRouter();
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  /** 一键取用：复制配方到我的万花筒 */
  const use = useCallback((id: string) => {
    const item = SQUARE_ITEMS.find((i) => i.id === id);
    if (!item) return;
    upsertEffect({
      id: newEffectId(),
      name: item.name,
      prompt: item.prompt,
      recipe: { ...item.recipe, palette: [...item.recipe.palette] },
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      forkedFrom: item.id,
    });
    setUsedIds((prev) => new Set(prev).add(id));
  }, []);

  const like = useCallback((id: string) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">万花筒广场</h1>
        <p className="mt-1 text-sm text-ink-2">
          大家分享的弹幕玩法。一键取用，或在原作基础上二次创作。
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {SQUARE_ITEMS.map((item) => {
          const used = usedIds.has(item.id);
          const liked = likedIds.has(item.id);
          return (
            <div
              key={item.id}
              className="group overflow-hidden rounded-2xl border border-line bg-card transition-all hover:-translate-y-0.5 hover:border-bili-blue/40 hover:shadow-lg"
            >
              <Link href={`/square/${item.id}`} className="block" title={`查看「${item.name}」详情`}>
                <EffectThumb recipe={item.recipe} seedText={item.id} />
              </Link>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/square/${item.id}`}
                    className="truncate text-sm font-semibold text-ink hover:text-bili-pink"
                  >
                    {item.name}
                  </Link>
                  <div className="ml-auto flex flex-none gap-1">
                    {item.tags.slice(0, 2).map((t) => (
                      <span key={t} className="rounded-full bg-fill px-1.5 py-0.5 text-[10px] text-ink-3">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="mt-1 truncate text-xs text-ink-3" title={item.prompt}>
                  「{item.prompt}」
                </p>

                <div className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-3">
                  <span
                    className="flex h-4.5 w-4.5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                    style={{ background: item.authorAvatarHue }}
                  >
                    {item.author[0]}
                  </span>
                  <span className="truncate">{item.author}</span>
                  <button
                    onClick={() => like(item.id)}
                    className={cn(
                      "ml-auto flex items-center gap-1 transition-colors",
                      liked ? "text-bili-pink" : "hover:text-bili-pink",
                    )}
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    {fmtNum(item.likes + (liked ? 1 : 0))}
                  </button>
                  <span className="flex items-center gap-1">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                      <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
                    </svg>
                    {fmtNum(item.remixes)} 二创
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                  <button
                    onClick={() => use(item.id)}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                      used ? "bg-success-light text-success" : "bg-bili-blue text-white hover:bg-bili-blue-hover",
                    )}
                  >
                    {used ? "✓ 已取用" : "使用"}
                  </button>
                  <button
                    onClick={() => router.push(`/studio?fork=${item.id}`)}
                    className="rounded-md bg-fill px-3 py-1 text-xs text-ink-2 transition-colors hover:text-bili-pink"
                  >
                    二创
                  </button>
                  {used && (
                    <Link href="/mine" className="ml-auto text-[11px] text-bili-blue hover:underline">
                      去我的万花筒 →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
