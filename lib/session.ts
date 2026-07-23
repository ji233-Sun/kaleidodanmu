"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { AuthUserDto } from "@/types";
import { apiFetch, ApiError } from "./api";

/**
 * 前端会话 store：页面首次使用时拉取 /api/auth/me 并全局缓存，
 * 登录 / 注册 / 退出后调用 refreshSession / clearSession 同步各组件。
 */

interface SessionState {
  user: AuthUserDto | null;
  /** 是否已向后端确认过会话（区分「加载中」和「未登录」） */
  loaded: boolean;
}

let state: SessionState = { user: null, loaded: false };
const listeners = new Set<() => void>();

const SERVER_STATE: SessionState = { user: null, loaded: false };

function setState(next: SessionState) {
  state = next;
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): SessionState {
  return state;
}

function getServerSnapshot(): SessionState {
  return SERVER_STATE;
}

/** 重新拉取当前会话；401 视为未登录。 */
export async function refreshSession(): Promise<AuthUserDto | null> {
  try {
    const { user } = await apiFetch<{ user: AuthUserDto }>("/api/auth/me");
    setState({ user, loaded: true });
    return user;
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) {
      console.error("[session] 拉取会话失败", e);
    }
    setState({ user: null, loaded: true });
    return null;
  }
}

/** 退出登录：通知后端销毁会话并清空本地状态。 */
export async function logoutSession(): Promise<void> {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch (e) {
    console.error("[session] 退出登录失败", e);
  }
  setState({ user: null, loaded: true });
}

/** 当前登录会话。首次挂载时自动拉取一次。 */
export function useSession() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (!state.loaded) void refreshSession();
  }, []);
  return {
    user: snap.user,
    /** 首次会话确认完成前为 true，避免闪烁登录/未登录两种 UI */
    loading: !snap.loaded,
    refresh: refreshSession,
    logout: logoutSession,
  };
}
