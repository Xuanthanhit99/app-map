"use client";

export class ClientApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly details?: { path: string; code: string }[]) { super(code); this.name = "ClientApiError"; }
}

let refreshing: Promise<boolean> | null = null;
async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/session/refresh", { method: "POST" }).then((r) => r.ok).finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  return refreshing;
}

/** Browser → same-origin proxy. Retries once after a transparent token refresh. */
export async function call<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}, retried = false): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api/proxy${path}`, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : {},
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ClientApiError(0, "OFFLINE");
  }
  if (r.status === 401 && !retried) {
    const body = await r.clone().json().catch(() => null);
    if (body?.error === "SESSION_EXPIRED" && await refreshSession()) return call<T>(path, init, true);
  }
  if (r.status === 204) return undefined as T;
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new ClientApiError(r.status, body?.error ?? `HTTP_${r.status}`, body?.details);
  return body as T;
}
