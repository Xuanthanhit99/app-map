import { loadTokens, saveTokens, type StoredTokens } from "../auth/tokenStore";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); this.name = "ApiError"; }
}
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");

let refreshing: Promise<StoredTokens | null> | null = null;
let onSignedOut: (() => void) | null = null;
export function setSignedOutHandler(fn: (() => void) | null) { onSignedOut = fn; }

async function refresh(current: StoredTokens): Promise<StoredTokens | null> {
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: current.refreshToken }) });
      if (!r.ok) { await saveTokens(null); onSignedOut?.(); return null; }
      const tokens = (await r.json()).tokens as StoredTokens;
      await saveTokens(tokens);
      return tokens;
    } catch { return null; } // network failure: keep tokens, caller sees OFFLINE
    finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

/** Authenticated JSON call with single-use refresh rotation on expiry. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  if (!API_BASE_URL) throw new ApiError(0, "API_NOT_CONFIGURED");
  let tokens = init.auth === false ? null : await loadTokens();
  if (tokens && Date.parse(tokens.accessExpiresAt) - Date.now() < 30_000) tokens = await refresh(tokens);
  const send = (t: StoredTokens | null) => fetch(`${API_BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers: { Accept: "application/json", ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(t ? { Authorization: `Bearer ${t.accessToken}` } : {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    ...(init.signal ? { signal: init.signal } : {}),
  });
  let r: Response;
  try { r = await send(tokens); } catch (e) { if ((e as Error).name === "AbortError") throw e; throw new ApiError(0, "OFFLINE"); }
  if (r.status === 401 && tokens) {
    const next = await refresh(tokens);
    if (next) { try { r = await send(next); } catch { throw new ApiError(0, "OFFLINE"); } }
  }
  if (r.status === 204) return undefined as T;
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, body?.error ?? `HTTP_${r.status}`);
  return body as T;
}

export async function signIn(path: "/v1/auth/login" | "/v1/auth/register", body: Record<string, unknown>) {
  const data = await api<{ user: SessionUser; tokens: StoredTokens }>(path, { method: "POST", body, auth: false });
  await saveTokens(data.tokens);
  return data.user;
}
export async function signOut() {
  try { await api("/v1/auth/logout", { method: "POST" }); } catch { /* revoke best-effort; local tokens are always cleared */ }
  await saveTokens(null);
}
export type SessionUser = { id: string; email: string; displayName: string; role: string };
