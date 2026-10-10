import type { IncomingMessage, ServerResponse } from "node:http";
import { buildDecisionPlans } from "./decision-engine";
import { readVerifiedPlaces, type VerifiedEvidenceRepository } from "./verified-evidence-repository";

/** Decision read boundary. GET never implies consent to personal context or a route. */
export async function handleVerifiedDecisionRead(
  request: IncomingMessage,
  response: ServerResponse,
  repository: VerifiedEvidenceRepository,
  now = new Date(),
): Promise<boolean> {
  if (request.url?.split("?")[0] !== "/v1/decision/plans") return false;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.writeHead(405);
    response.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
    return true;
  }
  try {
    const places = await readVerifiedPlaces(repository, now.getTime());
    // This read endpoint does not receive consent or intent; never infer them from IP or location.
    const result = buildDecisionPlans(places, { consentToUseContext: false }, now.getTime());
    response.writeHead(200);
    response.end(JSON.stringify({
      status: result.status,
      items: result.items,
      reason: result.status === "empty" ? "NO_VERIFIED_DATA" : undefined,
      provenance: [],
      evidence: { truth: "UNKNOWN", freshness: null, source: null, observedAt: null },
      generatedAt: now.toISOString(),
    }));
  } catch {
    response.writeHead(503);
    response.end(JSON.stringify({ status: "error", items: [], reason: "EVIDENCE_REPOSITORY_UNAVAILABLE" }));
  }
  return true;
}
