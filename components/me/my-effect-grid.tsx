"use client";

import Link from "next/link";
import type { PublishedEffect } from "@/lib/profile";
import { EffectThumb } from "@/components/effect-thumb";

function fmtNum(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** 收藏 / 点赞作品列表的统一网格。 */
export function MyEffectGrid({
  items,
  emptyText,
}: {
  items: PublishedEffect[];
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-card py-20 text-center text-sm text-ink-3">
        {emptyText}
      </p>
    );
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((fx) => (
        <Link
          key={fx.id}
          href={`/square/${fx.id}`}
          className="group overflow-hidden rounded-2xl border border-line bg-card transition-all hover:-translate-y-0.5 hover:border-bili-blue/40 hover:shadow-lg"
        >
          <EffectThumb recipe={fx.recipe} seedText={fx.id} />
          <div className="p-4">
            <p className="truncate text-sm font-semibold text-ink group-hover:text-bili-pink">
              {fx.name}
            </p>
            <p className="mt-1 truncate text-xs text-ink-3" title={fx.prompt}>
              「{fx.prompt}」
            </p>
            <p className="mt-2 text-[11px] text-ink-3">
              by {fx.author} · {fmtNum(fx.likes)} 赞 · {fmtNum(fx.favorites)} 收藏
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
