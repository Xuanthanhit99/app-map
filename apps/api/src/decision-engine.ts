export type TruthStatus = "KNOWN" | "UNKNOWN" | "CONFLICT";
export type Freshness = "FRESH" | "AGING" | "STALE";
export type EvidenceRecord = {
  truth: TruthStatus;
  source: string | null;
  observedAt: string | null;
  provenanceId: string | null;
};
export type VerifiedPlace = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  evidence: EvidenceRecord;
};
export type DecisionPlan = {
  id: string;
  title: string;
  stops: { placeId: string }[];
  evidence: EvidenceRecord & { freshness: Freshness };
};
export type DecisionResult =
  | { status: "empty"; items: []; reason: "NO_VERIFIED_DATA" | "INSUFFICIENT_CONTEXT" }
  | { status: "ready"; items: DecisionPlan[] };

export function evaluateEvidence(evidence: EvidenceRecord | null | undefined, now = Date.now()): {
  truth: TruthStatus; freshness: Freshness | null; safeToAssert: boolean;
} {
  if (!evidence || !["KNOWN", "UNKNOWN", "CONFLICT"].includes(evidence.truth)) {
    return { truth: "UNKNOWN", freshness: null, safeToAssert: false };
  }
  const time = typeof evidence.observedAt === "string" ? Date.parse(evidence.observedAt) : NaN;
  const validTime = Number.isFinite(time) && time <= now;
  const age = validTime ? now - time : null;
  const freshness = age === null ? null : age <= 300000 ? "FRESH" : age <= 1800000 ? "AGING" : "STALE";
  if (evidence.truth !== "KNOWN") return { truth: evidence.truth, freshness, safeToAssert: false };
  if (!validTime || !evidence.source?.trim() || !evidence.provenanceId?.trim()) {
    return { truth: "UNKNOWN", freshness: null, safeToAssert: false };
  }
  return { truth: "KNOWN", freshness, safeToAssert: freshness === "FRESH" };
}

/** Only explicitly supplied, provenance-backed places can become plans.
 * No ranking, routes, durations, costs or synthetic three-option output.
 */
export function buildDecisionPlans(places: readonly VerifiedPlace[], context: {
  intent?: string; consentToUseContext?: boolean;
}, now = Date.now()): DecisionResult {
  if (!context.consentToUseContext || !context.intent?.trim()) {
    return { status: "empty", items: [], reason: "INSUFFICIENT_CONTEXT" };
  }
  const valid = places.filter((place) =>
    Boolean(place.id?.trim() && place.title?.trim()) &&
    Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90 &&
    Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180 &&
    evaluateEvidence(place.evidence, now).safeToAssert
  );
  if (!valid.length) return { status: "empty", items: [], reason: "NO_VERIFIED_DATA" };
  return {
    status: "ready",
    items: valid.slice(0, 3).map((place) => ({
      id: place.id,
      title: place.title,
      stops: [{ placeId: place.id }],
      evidence: { ...place.evidence, freshness: "FRESH" as const },
    })),
  };
}
