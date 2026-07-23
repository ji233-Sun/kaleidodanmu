"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { KaleidoEffect } from "@/lib/types";
import type { EffectChannel, EffectDto, EffectVersionDto } from "@/types";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { upsertEffect } from "@/lib/store";
import { DEFAULT_EFFECT_SOURCE } from "@/lib/runtime/effect";
import { Alert, Badge, Button, Spinner } from "@/components/ui";
import type { BadgeHue } from "@/components/ui";
import { cn } from "@/lib/cn";

type BusyAction =
  | "link"
  | "sync"
  | "version"
  | "unlink"
  | `publish:${EffectChannel}`;

const CHANNELS: { key: EffectChannel; label: string; hue: BadgeHue }[] = [
  { key: "draft", label: "Draft", hue: "orange" },
  { key: "staging", label: "Staging", hue: "blue" },
  { key: "published", label: "Published", hue: "green" },
];

/** 生成符合服务端校验的 slug（^[a-z0-9][a-z0-9-]*$，1-64 字符） */
function makeSlug(): string {
  const rand = Math.random().toString(36).slice(2, 6).replace(/[^a-z0-9]/g, "0");
  return `fx-${Date.now().toString(36)}-${rand}`;
}

/** unicode 安全的 base64（裸 btoa 遇到非 latin1 字符会抛异常） */
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN", { hour12: false });
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "操作失败，请稍后重试";
}

export function CloudPanel({ effect }: { effect: KaleidoEffect }) {
  const { user, loading: sessionLoading } = useSession();
  const [cloud, setCloud] = useState<EffectDto | null>(null);
  const [versions, setVersions] = useState<EffectVersionDto[]>([]);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  /** 拉取云端 Effect + 版本列表；404 标记为云端作品已删除 */
  const refresh = useCallback(async () => {
    if (!effect.serverId) return;
    try {
      const [{ effect: ef }, { versions: vs }] = await Promise.all([
        apiFetch<{ effect: EffectDto }>(`/api/effects/${effect.serverId}`),
        apiFetch<{ versions: EffectVersionDto[] }>(`/api/effects/${effect.serverId}/versions`),
      ]);
      setCloud(ef);
      setVersions(vs);
      setMissing(false);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setCloud(null);
        setVersions([]);
        setMissing(true);
      } else {
        setError(errorMessage(e));
      }
    }
  }, [effect.serverId]);

  // 面板按 effect.id:updatedAt 作为 key 挂载，切换作品/配方会自动重置；
  // serverId 的写回/清除由面板内操作自行更新状态，这里仅负责拉取云端数据。
  // 经微任务触发 refresh，避免在 effect 体内同步 setState（react-hooks/set-state-in-effect）
  useEffect(() => {
    if (!user || !effect.serverId) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [user, effect.serverId, refresh]);

  const snapshotJson = useMemo(
    () =>
      JSON.stringify({
        prompt: effect.prompt,
        recipe: effect.recipe,
        entrySource: effect.entrySource ?? DEFAULT_EFFECT_SOURCE,
        version: effect.version,
      }),
    [effect.entrySource, effect.prompt, effect.recipe, effect.version],
  );

  const pushDraft = useCallback(
    async (serverId: number) => {
      await apiFetch(`/api/effects/${serverId}/draft`, {
        method: "PUT",
        json: { snapshotJson },
      });
    },
    [snapshotJson],
  );

  const linkToCloud = async () => {
    setError(null);
    setBusy("link");
    try {
      const slug = makeSlug();
      const { effect: created } = await apiFetch<{ effect: EffectDto }>("/api/effects", {
        method: "POST",
        json: { slug, name: effect.name },
      });
      await pushDraft(created.id);
      upsertEffect({ ...effect, serverId: created.id });
      setCloud(created);
      setVersions([]);
      setMissing(false);
      showToast("已保存到云端");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const syncDraft = async () => {
    if (!effect.serverId) return;
    setError(null);
    setBusy("sync");
    try {
      await pushDraft(effect.serverId);
      showToast("草稿已同步到云端");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const uploadVersion = async () => {
    if (!effect.serverId) return;
    setError(null);
    setBusy("version");
    try {
      const code = toBase64(effect.entrySource ?? DEFAULT_EFFECT_SOURCE);
      const { version: v } = await apiFetch<{ version: EffectVersionDto }>(
        `/api/effects/${effect.serverId}/versions`,
        {
          method: "POST",
          json: {
            version: `1.0.${versions.length}`,
            entry: "index.js",
            sdkVersion: "0.1.0",
            schemaVersion: "1",
            manifestJson: JSON.stringify({
              name: effect.name,
              prompt: effect.prompt,
              recipe: effect.recipe,
              capabilities: ["canvas", "danmaku", "three", "gsap"],
            }),
            code,
            channel: "draft",
          },
        },
      );
      showToast(`已上传版本 v${v.version}，并设为 Draft`);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const publish = async (versionId: number, channel: EffectChannel) => {
    if (!effect.serverId) return;
    setError(null);
    setBusy(`publish:${channel}`);
    try {
      await apiFetch(`/api/effects/${effect.serverId}/publish`, {
        method: "POST",
        json: { versionId, channel },
      });
      showToast(`已设为 ${CHANNELS.find((c) => c.key === channel)?.label ?? channel}`);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const unlink = () => {
    upsertEffect({ ...effect, serverId: undefined });
    setCloud(null);
    setVersions([]);
    setMissing(false);
    showToast("已解除本地关联（云端作品保留）");
  };

  const channelVersion = (channel: EffectChannel): EffectVersionDto | null => {
    if (!cloud) return null;
    const id =
      channel === "draft"
        ? cloud.draftVersionId
        : channel === "staging"
          ? cloud.stagingVersionId
          : cloud.publishedVersionId;
    if (id === null) return null;
    return versions.find((v) => v.id === id) ?? null;
  };

  const channelsOf = (v: EffectVersionDto): EffectChannel[] => {
    if (!cloud) return [];
    return CHANNELS.filter(
      (c) =>
        (c.key === "draft" && cloud.draftVersionId === v.id) ||
        (c.key === "staging" && cloud.stagingVersionId === v.id) ||
        (c.key === "published" && cloud.publishedVersionId === v.id),
    ).map((c) => c.key);
  };

  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <p className="text-xs font-semibold tracking-wider text-ink-3">云端版本与发布 CLOUD</p>
        {toast && <span className="ml-auto text-xs text-success">{toast}</span>}
        {!toast && effect.serverId && (
          <span className="ml-auto text-[11px] text-ink-3">云端 ID #{effect.serverId}</span>
        )}
      </div>

      {sessionLoading ? (
        <div className="flex items-center justify-center py-6">
          <Spinner size={24} />
        </div>
      ) : !user ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm leading-6 text-ink-2">
            登录后可将作品保存到云端、管理版本与发布。
          </p>
          <Link href="/login?next=/studio">
            <Button variant="outline" size="sm">
              去登录
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {error && <Alert hue="red" title={error} />}

          {missing && (
            <Alert hue="orange" title="云端作品已不存在">
              本地仍关联着云端的 #{effect.serverId}，但该作品已被删除。可重新保存到云端，或仅解除关联。
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={busy !== null} onClick={() => linkToCloud()}>
                  {busy === "link" ? "保存中…" : "重新保存到云端"}
                </Button>
                <Button variant="ghost" size="sm" disabled={busy !== null} onClick={unlink}>
                  解除关联
                </Button>
              </div>
            </Alert>
          )}

          {!effect.serverId ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm leading-6 text-ink-2">
                作品尚未关联云端。保存后可同步草稿、上传版本并发布到 Draft / Staging / Published 渠道。
              </p>
              <Button disabled={busy !== null} onClick={() => linkToCloud()}>
                {busy === "link" ? "保存中…" : "保存到云端"}
              </Button>
            </div>
          ) : !cloud && !missing && !error ? (
            // 初次拉取云端数据中
            <div className="flex items-center justify-center py-6">
              <Spinner size={24} />
            </div>
          ) : cloud ? (
            <>
              {/* 云端信息 + 渠道指针 */}
              <div className="rounded-lg bg-fill p-3">
                <p className="text-sm font-medium text-ink">
                  {cloud.name}
                  <span className="ml-2 text-xs font-normal text-ink-3">{cloud.slug}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CHANNELS.map((c) => {
                    const v = channelVersion(c.key);
                    return (
                      <Badge key={c.key} hue={c.hue}>
                        {c.label} {v ? `v${v.version}` : "未设置"}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              {/* 操作 */}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy !== null} onClick={syncDraft}>
                  {busy === "sync" ? "同步中…" : "同步草稿到云端"}
                </Button>
                <Button variant="secondary" size="sm" disabled={busy !== null} onClick={uploadVersion}>
                  {busy === "version" ? "上传中…" : "上传为新版本"}
                </Button>
                <Button variant="ghost" size="sm" disabled={busy !== null} onClick={unlink}>
                  解除关联
                </Button>
              </div>

              {/* 版本列表 */}
              <div>
                <p className="mb-2 text-xs font-medium text-ink-3">
                  版本列表（{versions.length}）
                </p>
                {versions.length === 0 ? (
                  <p className="text-xs text-ink-3">
                    还没有云端版本，点击「上传为新版本」创建第一个版本包。
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {versions.map((v) => {
                      const chs = channelsOf(v);
                      return (
                        <li
                          key={v.id}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2"
                        >
                          <span className="text-sm font-medium text-ink">v{v.version}</span>
                          {chs.map((c) => {
                            const meta = CHANNELS.find((x) => x.key === c)!;
                            return (
                              <Badge key={c} hue={meta.hue}>
                                {meta.label}
                              </Badge>
                            );
                          })}
                          <span className="text-xs text-ink-3">
                            {formatSize(v.sizeBytes)} · {formatTime(v.createdAt)}
                          </span>
                          <span className="ml-auto flex gap-1">
                            {CHANNELS.map((c) => {
                              const action: BusyAction = `publish:${c.key}`;
                              const current = chs.includes(c.key);
                              return (
                                <button
                                  key={c.key}
                                  disabled={busy !== null || current}
                                  onClick={() => publish(v.id, c.key)}
                                  className={cn(
                                    "rounded-md px-2 py-1 text-[11px] transition-colors",
                                    current
                                      ? "cursor-default bg-fill text-ink-3"
                                      : "bg-fill text-ink-2 hover:bg-bili-pink-light hover:text-bili-pink disabled:opacity-50",
                                  )}
                                >
                                  {busy === action ? "设置中…" : `设为 ${c.label}`}
                                </button>
                              );
                            })}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
