import type { IncomingMessage, ServerResponse } from "node:http";
import { buildDecisionPlans } from "./decision-engine";
import { readVerifiedPlaces, type VerifiedEvidenceRepository } from "./verified-evidence-repository";

const QUERY_PATH = "/v1/decision/plans/query";
const READ_PATH = "/v1/decision/plans";
const MAX_BODY = 4096;
type Query = { intent: string; consentToUseContext: true };

function parseQuery(body: unknown): Query | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const data = body as Record<string, unknown>;
  if (Object.keys(data).some((key) => !["intent", "consentToUseContext"].includes(key))) return null;
  if (typeof data.intent !== "string" || data.intent.trim().length < 2 || data.intent.length > 160 ||
      data.consentToUseContext !== true) return null;
  return { intent: data.intent.trim(), consentToUseContext: true };
}
function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

/** Explicit context only. GET remains context-free and never infers consent from IP/GPS. */
export async function handleVerifiedDecisionRead(
  request: IncomingMessage, response: ServerResponse, repository: VerifiedEvidenceRepository, now = new Date(),
): Promise<boolean> {
  const path = request.url?.split("?")[0];
  if (path !== READ_PATH && path !== QUERY_PATH) return false;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  const expectedMethod = path === QUERY_PATH ? "POST" : "GET";
  if (request.method !== expectedMethod) {
    response.setHeader("Allow", expectedMethod);
    json(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return true;
  }
  let context: { intent?: string; consentToUseContext: boolean } = { consentToUseContext: false };
  if (path === QUERY_PATH) {
    const contentType = request.headers?.["content-type"] ?? "";
    if (!/^application\/json(?:\s*;|\s*$)/i.test(String(contentType))) {
      json(response, 415, { error: "UNSUPPORTED_MEDIA_TYPE" }); return true;
    }
    const contentLength = Number(request.headers?.["content-length"] ?? 0);
    if (!Number.isFinite(contentLength) || contentLength > MAX_BODY) {
      json(response, 413, { error: "PAYLOAD_TOO_LARGE" }); return true;
    }
    let bytes = 0, raw = "";
    try {
      for await (const chunk of request) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > MAX_BODY) { json(response, 413, { error: "PAYLOAD_TOO_LARGE" }); return true; }
        raw += buffer.toString("utf8");
      }
      const parsed = parseQuery(JSON.parse(raw) as unknown);
      if (!parsed) { json(response, 400, { error: "INVALID_DECISION_QUERY" }); return true; }
      context = parsed;
    } catch {
      json(response, 400, { error: "INVALID_DECISION_QUERY" }); return true;
    }
  }
  try {
    const places = await readVerifiedPlaces(repository, now.getTime());
    const result = buildDecisionPlans(places, context, now.getTime());
    json(response, 200, {
      status: result.status, items: result.items,
      reason: result.status === "empty" ? result.reason : undefined,
      provenance: result.status === "ready" ? result.items.map(item => ({ placeId: item.id, provenanceId: item.evidence.provenanceId, source: item.evidence.source })) : [],
      evidence: { truth: "UNKNOWN", freshness: null, source: null, observedAt: null },
      generatedAt: now.toISOString(),
    });
  } catch {
    json(response, 503, { status: "error", items: [], reason: "EVIDENCE_REPOSITORY_UNAVAILABLE" });
  }
  return true;
}
