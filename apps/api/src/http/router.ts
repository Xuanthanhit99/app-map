import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { ApiError, forbidden, tooMany, unauthorized } from "./errors";
import type { RateLimitStore } from "./rate-limit";
import type { ClientIdentityResolver } from "../client-identity";

export type Role = "user" | "moderator" | "admin";
export type AuthUser = { id: string; role: Role; status: "active" | "suspended" | "banned"; sessionId: string; trustScore: number };
export type AuthLevel = "none" | "optional" | "user" | "moderator" | "admin";

export type RequestContext = {
  req: IncomingMessage;
  res: ServerResponse;
  requestId: string;
  method: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  /** Parsed JSON body (undefined for GET/HEAD or empty body). */
  body: unknown;
  user: AuthUser | null;
  /** Opaque rate-limit identity (never logged). */
  clientKey: string;
};

export type HandlerResult = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Raw (non-JSON) payload, e.g. sitemap XML. */
  raw?: { contentType: string; data: string | Buffer };
};
export type Handler = (ctx: RequestContext) => Promise<HandlerResult> | HandlerResult;

export type RouteOptions = {
  auth?: AuthLevel;
  /** Max JSON body bytes; default 16 KiB. */
  bodyLimit?: number;
  /** Extra per-route limit, keyed by user id when authenticated, client key otherwise. */
  rateLimit?: { name: string; limit: number; windowMs: number };
  /** Public cacheable GET (sets Cache-Control: public, max-age). Default: no-store. */
  cacheSeconds?: number;
};

type Route = { method: string; segments: string[]; handler: Handler; options: RouteOptions; pattern: string };

export type RouterDeps = {
  authenticate: (accessToken: string) => Promise<AuthUser | null>;
  rateLimits: RateLimitStore;
  identifyClient: ClientIdentityResolver;
  allowedOrigins: readonly string[];
  globalLimit?: { limit: number; windowMs: number };
  limitScale?: number;
  /** Include error messages in unhandled-error logs (development/test only; DB messages can echo values). */
  verboseErrors?: boolean;
  log?: (event: Record<string, unknown>) => void;
};

const ROLE_RANK: Record<Role, number> = { user: 1, moderator: 2, admin: 3 };

export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler, options: RouteOptions = {}): this {
    this.routes.push({ method, segments: pattern.split("/").filter(Boolean), handler, options, pattern });
    return this;
  }
  get(p: string, h: Handler, o?: RouteOptions) { return this.add("GET", p, h, o); }
  post(p: string, h: Handler, o?: RouteOptions) { return this.add("POST", p, h, o); }
  put(p: string, h: Handler, o?: RouteOptions) { return this.add("PUT", p, h, o); }
  patch(p: string, h: Handler, o?: RouteOptions) { return this.add("PATCH", p, h, o); }
  delete(p: string, h: Handler, o?: RouteOptions) { return this.add("DELETE", p, h, o); }

  list(): { method: string; pattern: string; auth: AuthLevel }[] {
    return this.routes.map((r) => ({ method: r.method, pattern: r.pattern, auth: r.options.auth ?? "none" }));
  }

  match(method: string, path: string): { route: Route; params: Record<string, string> } | { allowed: string[] } | null {
    const parts = path.split("/").filter(Boolean);
    const allowed: string[] = [];
    for (const route of this.routes) {
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const seg = route.segments[i]!;
        const part = parts[i]!;
        if (seg.startsWith(":")) {
          let decoded: string;
          try { decoded = decodeURIComponent(part); } catch { ok = false; break; }
          if (!decoded || decoded.length > 200) { ok = false; break; }
          params[seg.slice(1)] = decoded;
        } else if (seg !== part) { ok = false; break; }
      }
      if (!ok) continue;
      if (route.method === method || (method === "HEAD" && route.method === "GET")) return { route, params };
      allowed.push(route.method);
    }
    return allowed.length ? { allowed } : null;
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  if (res.headersSent) return;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (status === 204) { res.writeHead(204); res.end(); return; }
  const payload = JSON.stringify(body);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.writeHead(status);
  res.end(payload);
}

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > limit) throw new ApiError(413, "PAYLOAD_TOO_LARGE");
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > limit) throw new ApiError(413, "PAYLOAD_TOO_LARGE");
    chunks.push(buffer);
  }
  if (!bytes) return undefined;
  const type = String(req.headers["content-type"] ?? "");
  if (!/^application\/json(\s*;|\s*$)/i.test(type)) throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE");
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new ApiError(400, "INVALID_JSON"); }
}

function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const m = /^Bearer ([A-Za-z0-9_\-.]{20,200})$/.exec(header.trim());
  return m?.[1] ?? null;
}

/**
 * Security headers, CORS allow-list, global + per-route rate limits, auth, body parsing and a
 * uniform error envelope. Logs never contain URLs with query strings, bodies, tokens, IPs or coordinates.
 */
export function createRequestListener(router: Router, deps: RouterDeps, fallback?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>) {
  const log = deps.log ?? ((e) => process.stdout.write(JSON.stringify(e) + "\n"));
  const scale = deps.limitScale ?? 1;
  const globalLimit = deps.globalLimit ?? { limit: 240, windowMs: 60_000 };
  return async (req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    const requestId = randomUUID();
    let routePattern = "unmatched";
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Cache-Control", "no-store");
    res.once("finish", () => log({ timestamp: new Date().toISOString(), event: "http_request", requestId,
      method: req.method, route: routePattern, status: res.statusCode, durationMs: Date.now() - started }));
    try {
      const origin = req.headers.origin;
      if (typeof origin === "string") {
        res.setHeader("Vary", "Origin");
        if (!deps.allowedOrigins.includes(origin)) throw new ApiError(403, "ORIGIN_NOT_ALLOWED");
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Access-Control-Max-Age", "600");
      }
      if (req.method === "OPTIONS") { res.writeHead(origin ? 204 : 405); res.end(); return; }

      const clientKey = deps.identifyClient(req).key;
      const global = await deps.rateLimits.hit(`g:${clientKey}`, globalLimit.limit * scale, globalLimit.windowMs);
      if (!global.allowed) throw tooMany((global.resetAt - Date.now()) / 1000);

      const url = new URL(req.url ?? "/", "http://localhost");
      const method = req.method ?? "GET";
      const matched = router.match(method, url.pathname);
      if (!matched) {
        if (fallback && await fallback(req, res)) { routePattern = "legacy"; return; }
        throw new ApiError(404, "NOT_FOUND");
      }
      if ("allowed" in matched) {
        throw new ApiError(405, "METHOD_NOT_ALLOWED", undefined, undefined, { Allow: [...new Set(matched.allowed)].join(", ") });
      }
      const { route, params } = matched;
      routePattern = `${route.method} ${route.pattern}`;
      const level = route.options.auth ?? "none";

      let user: AuthUser | null = null;
      const token = bearer(req);
      if (level !== "none" && token) user = await deps.authenticate(token);
      if (level !== "none" && level !== "optional") {
        if (!user) throw unauthorized(token ? "INVALID_OR_EXPIRED_TOKEN" : "UNAUTHENTICATED");
        if (user.status !== "active") throw forbidden("ACCOUNT_NOT_ACTIVE");
        if (ROLE_RANK[user.role] < ROLE_RANK[level]) throw forbidden("INSUFFICIENT_ROLE");
      }
      if (route.options.rateLimit) {
        const { name, limit, windowMs } = route.options.rateLimit;
        const decision = await deps.rateLimits.hit(`r:${name}:${user ? `u:${user.id}` : clientKey}`, limit * scale, windowMs);
        if (!decision.allowed) throw tooMany((decision.resetAt - Date.now()) / 1000);
      }
      const body = method === "GET" || method === "HEAD" || method === "DELETE"
        ? undefined : await readJson(req, route.options.bodyLimit ?? 16_384);
      const result = await route.handler({
        req, res, requestId, method, path: url.pathname, query: url.searchParams, params, body, user, clientKey,
      });
      if (res.headersSent) return;
      if (route.options.cacheSeconds && method === "GET") {
        res.setHeader("Cache-Control", `public, max-age=${route.options.cacheSeconds}`);
      }
      if (result.raw) {
        for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v);
        res.setHeader("Content-Type", result.raw.contentType);
        res.writeHead(result.status ?? 200);
        res.end(result.raw.data);
        return;
      }
      send(res, result.status ?? 200, result.body ?? {}, result.headers);
    } catch (error) {
      if (error instanceof ApiError) {
        send(res, error.status, {
          error: error.code,
          ...(error.details ? { details: error.details } : {}),
          requestId,
        }, error.headers);
        return;
      }
      log({ timestamp: new Date().toISOString(), event: "unhandled_error", requestId, route: routePattern,
        errorName: error instanceof Error ? error.name : "UNKNOWN",
        // Message only for programmer errors; DB errors may echo values, so keep the code only.
        code: (error as { code?: string })?.code ?? null,
        ...(deps.verboseErrors && error instanceof Error ? { message: error.message } : {}) });
      send(res, 500, { error: "INTERNAL_ERROR", requestId });
    }
  };
}
