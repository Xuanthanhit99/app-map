import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createClientIdentityResolver, type ClientIdentityResolver } from "./client-identity";

// Default: forwarded headers are never trusted. A proxy mode must be configured explicitly (see client-identity.ts).
const socketPeerIdentity = createClientIdentityResolver({ mode: "none" });

const windows = new Map<string, { count: number; reset: number }>();
const MAX_KEYS = 20_000;
export function checkRateLimit(key: string, now = Date.now(), limit = 90, intervalMs = 60_000): boolean {
  if (windows.size > MAX_KEYS) {
    for (const [id, entry] of windows) if (entry.reset <= now) windows.delete(id);
    if (windows.size > MAX_KEYS) windows.clear();
  }
  const entry = windows.get(key);
  if (!entry || entry.reset <= now) { windows.set(key, { count: 1, reset: now + intervalMs }); return true; }
  entry.count++;
  return entry.count <= limit;
}

/** In-memory, per-process window: with N replicas the effective limit per client is up to N x limit. */
export function applyApiGuards(
  request: IncomingMessage, response: ServerResponse, origins: readonly string[],
  identify: ClientIdentityResolver = socketPeerIdentity,
): boolean {
  const requestId = randomUUID();
  response.setHeader("X-Request-Id", requestId);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
  const origin = request.headers.origin;
  if (origin) {
    response.setHeader("Vary", "Origin");
    if (!origins.includes(origin)) {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "ORIGIN_NOT_ALLOWED", requestId }));
      return false;
    }
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (request.method === "OPTIONS") {
    response.writeHead(origin ? 204 : 405); response.end(); return false;
  }
  // The identity key may contain an IP prefix: it is used only as an in-memory map key and never logged.
  if (!checkRateLimit(identify(request).key)) {
    response.writeHead(429, { "Content-Type": "application/json", "Retry-After": "60" });
    response.end(JSON.stringify({ error: "RATE_LIMITED", requestId }));
    return false;
  }
  return true;
}

export function logApiEvent(event: string, fields: { requestId?: string; status?: number; durationMs?: number }): void {
  // No URLs, query strings, coordinates, request bodies, bearer tokens or IP addresses in logs.
  process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }) + "\n");
}
