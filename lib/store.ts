"use client";

import type { KaleidoEffect } from "./types";

const KEY = "kaleido:effects:v1";

/** 我的作品：原型阶段存 localStorage，之后替换为服务端 Effect 表。 */

let cache: KaleidoEffect[] | null = null;
const listeners = new Set<() => void>();

export function loadEffects(): KaleidoEffect[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as KaleidoEffect[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** useSyncExternalStore 快照：同一版本内保持引用稳定 */
export function getEffectsSnapshot(): KaleidoEffect[] {
  if (cache === null) cache = loadEffects();
  return cache;
}

const SERVER_SNAPSHOT: KaleidoEffect[] = [];

export function getEffectsServerSnapshot(): KaleidoEffect[] {
  return SERVER_SNAPSHOT;
}

export function subscribeEffects(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function saveEffects(list: KaleidoEffect[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  cache = list;
  listeners.forEach((cb) => cb());
}

export function getEffect(id: string): KaleidoEffect | undefined {
  return getEffectsSnapshot().find((e) => e.id === id);
}

export function upsertEffect(effect: KaleidoEffect) {
  const list = [...getEffectsSnapshot()];
  const idx = list.findIndex((e) => e.id === effect.id);
  if (idx >= 0) list[idx] = effect;
  else list.unshift(effect);
  saveEffects(list);
}

export function deleteEffect(id: string) {
  saveEffects(getEffectsSnapshot().filter((e) => e.id !== id));
}

export function newEffectId(): string {
  return `fx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newStudioSessionId(): string {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
