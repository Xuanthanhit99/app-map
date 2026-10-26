import { NextResponse, type NextRequest } from "next/server";

const ACCESS = "rt_a";
const REFRESH = "rt_r";
const API_URL = (process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
const SECURE = process.env.COOKIE_SECURE === "true";

/**
 * Silent session renewal before rendering: when the short-lived access cookie has expired but a refresh
 * cookie exists, rotate tokens once and forward the request with the new access token. Static assets and
 * the session endpoints themselves are excluded.
 */
export async function proxy(request: NextRequest) {
  const refresh = request.cookies.get(REFRESH)?.value;
  if (request.cookies.get(ACCESS) || !refresh) return NextResponse.next();
  let tokens: { accessToken: string; refreshToken: string; accessExpiresAt: string; refreshExpiresAt: string } | null = null;
  try {
    const r = await fetch(`${API_URL}/v1/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: refresh }), cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (r.ok) tokens = (await r.json()).tokens;
  } catch { tokens = null; }
  if (!tokens) {
    const res = NextResponse.next();
    res.cookies.delete(REFRESH);
    return res;
  }
  const headers = new Headers(request.headers);
  const others = request.cookies.getAll().filter((c) => c.name !== ACCESS && c.name !== REFRESH).map((c) => `${c.name}=${c.value}`);
  headers.set("cookie", [...others, `${ACCESS}=${tokens.accessToken}`, `${REFRESH}=${tokens.refreshToken}`].join("; "));
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(ACCESS, tokens.accessToken, { httpOnly: true, sameSite: "lax", secure: SECURE, path: "/", expires: new Date(tokens.accessExpiresAt) });
  res.cookies.set(REFRESH, tokens.refreshToken, { httpOnly: true, sameSite: "strict", secure: SECURE, path: "/", expires: new Date(tokens.refreshExpiresAt) });
  return res;
}

export const config = { matcher: ["/((?!_next/|api/session/|icon.svg|manifest.webmanifest|robots.txt|sitemap.xml).*)"] };
