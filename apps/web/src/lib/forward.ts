/**
 * The web server is a trusted hop. It forwards the browser's address so the API's per-client
 * limits still apply. With INTERNAL_PROXY_SECRET set (QA/production), the address travels in
 * X-Reality-Client-IP authenticated by X-Reality-Proxy-Token; the API ignores it without the secret.
 * Locally (no secret) it falls back to X-Forwarded-For for an API running TRUST_PROXY=xff.
 *
 * Client address source: X-Real-IP is set by the hosting edge (Railway) and cannot be supplied by
 * the browser; the right-most X-Forwarded-For entry is the fallback for other single-proxy setups.
 */
export function forwardHeaders(request: Request): Record<string, string> {
  const xff = request.headers.get("x-forwarded-for");
  const real = request.headers.get("x-real-ip");
  const client = (real ?? xff?.split(",").pop())?.trim();
  if (!client) return {};
  const secret = process.env.INTERNAL_PROXY_SECRET;
  if (secret) return { "X-Reality-Client-IP": client, "X-Reality-Proxy-Token": secret };
  return { "X-Forwarded-For": client };
}
