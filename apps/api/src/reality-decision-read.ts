import type { IncomingMessage, ServerResponse } from "node:http";

type CollectionKind = "reality" | "decision";
type Evidence = { truth: "KNOWN" | "UNKNOWN" | "CONFLICT"; freshness: "FRESH" | "AGING" | "STALE" | null; source: string | null; observedAt: string | null };
type CollectionResponse = { status: "empty"; items: []; reason: "NO_VERIFIED_DATA"; provenance: []; evidence: Evidence; generatedAt: string };

export function collectionResponse(kind: CollectionKind, now = new Date()): CollectionResponse {
  // No persistent evidence repository or verified decision engine is connected yet.
  // Never create synthetic observations, places, recommendations or timestamps.
  void kind;
  return {
    status: "empty",
    items: [],
    reason: "NO_VERIFIED_DATA",
    provenance: [],
    evidence: { truth: "UNKNOWN", freshness: null, source: null, observedAt: null },
    generatedAt: now.toISOString(), // response time only, not an observation time
  };
}

export function handleRealityDecisionRead(request: IncomingMessage, response: ServerResponse): boolean {
  const path = request.url?.split("?")[0];
  const kind = path === "/v1/reality/pulses" ? "reality" : path === "/v1/decision/plans" ? "decision" : null;
  if (!kind) return false;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.writeHead(405);
    response.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
    return true;
  }
  response.writeHead(200);
  response.end(JSON.stringify(collectionResponse(kind)));
  return true;
}
