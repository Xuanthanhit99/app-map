import { describe, expect, it } from "vitest";
import { buildDecisionPlans, evaluateEvidence, type VerifiedPlace } from "../apps/api/src/decision-engine";
import { readVerifiedPlaces, UnconfiguredEvidenceRepository } from "../apps/api/src/verified-evidence-repository";

const now = Date.parse("2026-10-09T04:00:00Z");
const place: VerifiedPlace = {
  id: "verified-place", title: "Verified place", latitude: 21.03, longitude: 105.85,
  evidence: { truth: "KNOWN", source: "verified-provider", provenanceId: "source-record-1", observedAt: "2026-10-09T03:59:00Z" },
};

describe("provenance repository and decision gate", () => {
  it("defaults to no data when no evidence source is connected", async () => {
    expect(await readVerifiedPlaces(new UnconfiguredEvidenceRepository(), now)).toEqual([]);
    expect(buildDecisionPlans([], { intent: "explore", consentToUseContext: true }, now)).toMatchObject({ status: "empty", reason: "NO_VERIFIED_DATA" });
  });
  it.each(["UNKNOWN", "CONFLICT"] as const)("never asserts %s even when fresh", (truth) => {
    expect(evaluateEvidence({ ...place.evidence, truth }, now)).toMatchObject({ truth, freshness: "FRESH", safeToAssert: false });
  });
  it.each([["AGING", "2026-10-09T03:50:00Z"], ["STALE", "2026-10-09T03:00:00Z"]] as const)("rejects %s evidence", (freshness, observedAt) => {
    expect(evaluateEvidence({ ...place.evidence, observedAt }, now)).toMatchObject({ freshness, safeToAssert: false });
  });
  it("rejects missing provenance and future observations", () => {
    expect(evaluateEvidence({ ...place.evidence, provenanceId: null }, now).safeToAssert).toBe(false);
    expect(evaluateEvidence({ ...place.evidence, observedAt: "2026-10-09T04:01:00Z" }, now).safeToAssert).toBe(false);
  });
  it("does not generate plans without context consent", () => {
    expect(buildDecisionPlans([place], { intent: "explore", consentToUseContext: false }, now)).toMatchObject({ status: "empty", reason: "INSUFFICIENT_CONTEXT" });
  });
  it("only passes verified places and does not pad to three plans", async () => {
    const repository = { listPlaces: async () => [place, { ...place, id: "conflicted", evidence: { ...place.evidence, truth: "CONFLICT" as const } }] };
    const verified = await readVerifiedPlaces(repository, now);
    expect(verified).toHaveLength(1);
    const plans = buildDecisionPlans(verified, { intent: "explore", consentToUseContext: true }, now);
    expect(plans.status).toBe("ready");
    expect(plans.items).toHaveLength(1);
  });
});
