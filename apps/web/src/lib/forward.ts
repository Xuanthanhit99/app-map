/**
 * The web server is a trusted hop: it forwards the browser's address so the API's per-client
 * limits still apply (API must run with TRUST_PROXY=xff and TRUSTED_PROXY_CIDRS pinned to this service).
 */
export function forwardHeaders(request: Request): Record<string, string> {
  const xff = request.headers.get("x-forwarded-for");
  const real = request.headers.get("x-real-ip");
  const client = real ?? xff?.split(",").pop()?.trim();
  return client ? { "X-Forwarded-For": client } : {};
}
