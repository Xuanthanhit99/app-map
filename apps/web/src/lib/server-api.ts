import "server-only";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, API_URL } from "./config";

export class ApiFailure extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); this.name = "ApiFailure"; }
}

/**
 * Server-side API call. Public reads are cacheable (revalidate); authenticated reads use the session
 * cookie and are never cached. The access token never reaches client JavaScript.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean; revalidate?: number | false } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.auth) {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      ...(init.auth || init.revalidate === false ? { cache: "no-store" as const } : { next: { revalidate: init.revalidate ?? 60 } }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ApiFailure(503, "API_UNREACHABLE");
  }
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiFailure(response.status, body?.error ?? `HTTP_${response.status}`);
  return body as T;
}

export async function apiOrNull<T>(path: string, init: Parameters<typeof api>[1] = {}): Promise<T | null> {
  try { return await api<T>(path, init); } catch (e) { if (e instanceof ApiFailure && (e.status === 404 || e.status === 401)) return null; throw e; }
}
