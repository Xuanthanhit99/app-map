import "server-only";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, API_URL, COOKIE_SECURE, REFRESH_COOKIE } from "./config";

export type Tokens = { accessToken: string; refreshToken: string; accessExpiresAt: string; refreshExpiresAt: string };
export type SessionUser = { id: string; email: string; displayName: string; role: "user" | "moderator" | "admin"; locale: string };

/** httpOnly, SameSite=Lax cookies; refresh token scoped to the session endpoints only. */
export async function setSessionCookies(t: Tokens) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, t.accessToken, { httpOnly: true, sameSite: "lax", secure: COOKIE_SECURE, path: "/", expires: new Date(t.accessExpiresAt) });
  jar.set(REFRESH_COOKIE, t.refreshToken, { httpOnly: true, sameSite: "strict", secure: COOKIE_SECURE, path: "/api/session", expires: new Date(t.refreshExpiresAt) });
}
export async function clearSessionCookies() {
  const jar = await cookies();
  jar.delete({ name: ACCESS_COOKIE, path: "/" });
  jar.delete({ name: REFRESH_COOKIE, path: "/api/session" });
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const r = await fetch(`${API_URL}/v1/me`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    return (await r.json()).user as SessionUser;
  } catch { return null; }
}

export async function refreshWith(refreshToken: string): Promise<Tokens | null> {
  try {
    const r = await fetch(`${API_URL}/v1/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }), cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()).tokens as Tokens;
  } catch { return null; }
}
