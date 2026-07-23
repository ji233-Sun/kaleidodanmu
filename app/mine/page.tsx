"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import type { KaleidoEffect } from "@/lib/types";
import {
  deleteEffect,
  getEffectsServerSnapshot,
  getEffectsSnapshot,
  subscribeEffects,
  upsertEffect,
} from "@/lib/store";
import { EffectThumb } from "@/components/effect-thumb";
import { cn } from "@/lib/cn";

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function MinePage() {
  const router = useRouter();
  const effects = useSyncExternalStore(
    subscribeEffects,
    getEffectsSnapshot,
    getEffectsServerSnapshot,
  );
  // SSR / 首帧水合期间快照为空，避免闪烁空态
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const remove = useCallback((id: string) => {
    deleteEffect(id);
  }, []);

  const toggleShare = useCallback((effect: KaleidoEffect) => {
    upsertEffect({ ...effect, shared: !effect.shared, updatedAt: Date.now() });
  }, []);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">我的万花筒</h1>
          <p className="mt-1 text-sm text-ink-2">
            管理你创建的所有弹幕配方，点击卡片继续对话迭代。
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-bili-pink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bili-pink-hover"
        >
          + 新建万花筒
        </Link>
      </div>

      {!hydrated ? null : effects.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-card py-20">
          <span className="h-8 w-8 rotate-45 rounded-lg bg-gradient-to-br from-bili-blue via-bili-purple to-bili-pink opacity-60" />
          <p className="text-sm text-ink-2">还没有作品，用一句话创建你的第一个万花筒吧</p>
          <Link href="/" className="text-sm font-medium text-bili-pink hover:underline">
            去创建 →
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {effects.map((fx) => (
            <div
              key={fx.id}
              className="group overflow-hidden rounded-2xl border border-line bg-card transition-all hover:-translate-y-0.5 hover:border-bili-pink/40 hover:shadow-lg"
            >
              <button
                onClick={() => router.push(`/studio?id=${fx.id}`)}
                className="block w-full cursor-pointer"
                title="预览并继续迭代"
              >
                <EffectThumb recipe={fx.recipe} seedText={fx.id} />
              </button>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => router.push(`/studio?id=${fx.id}`)}
                    className="truncate text-sm font-semibold text-ink hover:text-bili-pink"
                  >
                    {fx.name}
                  </button>
                  <span className="flex-none rounded-full bg-bili-purple-light px-1.5 py-0.5 text-[10px] font-medium text-bili-purple">
                    v{fx.version}
                  </span>
                  {fx.forkedFrom && (
                    <span className="flex-none rounded-full bg-bili-blue-light px-1.5 py-0.5 text-[10px] text-bili-blue">
                      二创
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-ink-3" title={fx.prompt}>
                  「{fx.prompt}」
                </p>
                <p className="mt-2 text-[11px] text-ink-3">更新于 {fmtTime(fx.updatedAt)}</p>
                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                  <Link
                    href={`/studio?id=${fx.id}`}
                    className="rounded-md bg-bili-pink px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-bili-pink-hover"
                  >
                    继续创作
                  </Link>
                  <button
                    onClick={() => toggleShare(fx)}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs transition-colors",
                      fx.shared
                        ? "bg-success-light text-success"
                        : "bg-fill text-ink-2 hover:text-bili-pink",
                    )}
                  >
                    {fx.shared ? "已分享" : "分享"}
                  </button>
                  <button
                    onClick={() => remove(fx.id)}
                    className="ml-auto rounded-md px-2 py-1 text-xs text-ink-3 transition-colors hover:bg-error-light hover:text-error"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
