import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, API_URL } from "@/lib/config";
import { forwardHeaders } from "@/lib/forward";

/**
 * Same-origin BFF proxy for browser calls: attaches the httpOnly access token, never exposes it.
 * Only /v1/* is reachable; auth endpoints are handled by /api/session/*.
 */
async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = "/" + path.map(encodeURIComponent).join("/");
  // Credential-issuing endpoints go through /api/session/* so tokens never reach the browser.
  const blocked = ["/v1/auth/login", "/v1/auth/register", "/v1/auth/refresh", "/v1/auth/federated"];
  if (!target.startsWith("/v1/") || blocked.includes(target)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const url = new URL(request.url);
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const headers: Record<string, string> = { Accept: "application/json", ...forwardHeaders(request) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const hasBody = !["GET", "HEAD", "DELETE"].includes(request.method);
  if (hasBody) headers["Content-Type"] = "application/json";
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}${target}${url.search}`, { method: request.method, headers, ...(hasBody ? { body: await request.text() } : {}), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    return NextResponse.json({ error: "API_UNREACHABLE" }, { status: 503 });
  }
  if (upstream.status === 401 && token) return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 401 });
  const out = new NextResponse(upstream.status === 204 ? null : await upstream.arrayBuffer(), { status: upstream.status });
  for (const h of ["content-type", "content-disposition", "retry-after"]) { const v = upstream.headers.get(h); if (v) out.headers.set(h, v); }
  out.headers.set("Cache-Control", "no-store");
  return out;
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
