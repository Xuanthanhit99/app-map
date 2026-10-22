import { describe, expect, it } from "vitest";
import { evaluateState, type Evidence } from "../src/reality/state-engine";
import { severityOf } from "../src/reality/catalog";

const NOW = Date.parse("2026-10-22T03:00:00Z");
const min = 60_000;
const community = (id: string, value: string, contributor: string, agoMin = 1, extra: Partial<Evidence> = {}): Evidence => ({
  id, value, sourceId: "community", sourceKind: "COMMUNITY", sourceReliability: 0.4, nature: "COMMUNITY_REPORT",
  observedAt: NOW - agoMin * min, validUntil: NOW + 60 * min, confidence: 0.5, contributor, ...extra,
});
const provider = (id: string, value: string, agoMin = 1, extra: Partial<Evidence> = {}): Evidence => ({
  id, value, sourceId: "open-meteo", sourceKind: "MODEL", sourceReliability: 0.6, nature: "FORECAST",
  observedAt: NOW - agoMin * min, validUntil: NOW + 60 * min, confidence: 0.8, contributor: null, ...extra,
});

describe("Reality State Engine — trust policy", () => {
  it("P1: no active evidence is UNKNOWN, never SAFE/CLEAR", () => {
    const s = evaluateState("ROAD", [community("a", "FLOODED_DEEP", "u1", 1, { validUntil: NOW - 1 })], NOW);
    expect(s).toMatchObject({ truth: "UNKNOWN", value: null, safety: "NONE", reason: "NO_ACTIVE_EVIDENCE" });
  });

  it("P3: a single community report stays UNKNOWN with a REPORTED_UNVERIFIED signal (observation != incident)", () => {
    const s = evaluateState("ROAD", [community("a", "FLOODED_DEEP", "u1")], NOW);
    expect(s.truth).toBe("UNKNOWN");
    expect(s.safety).toBe("NONE");
    expect(s.reason).toBe("SINGLE_UNVERIFIED_REPORT");
    expect(s.signals).toEqual([expect.objectContaining({ type: "REPORTED_UNVERIFIED", value: "FLOODED_DEEP", contributors: 1 })]);
  });

  it("P3: the same contributor reporting twice is still one contributor", () => {
    const s = evaluateState("ROAD", [community("a", "BLOCKED", "u1"), community("b", "BLOCKED", "u1")], NOW);
    expect(s.truth).toBe("UNKNOWN");
    expect(s.reason).toBe("INSUFFICIENT_CORROBORATION");
  });

  it("P3: two distinct contributors agreeing establish KNOWN with the domain safety", () => {
    const s = evaluateState("ROAD", [community("a", "FLOODED_MODERATE", "u1", 5), community("b", "FLOODED_MODERATE", "u2", 2)], NOW);
    expect(s).toMatchObject({ truth: "KNOWN", value: "FLOODED_MODERATE", safety: "AVOID", freshness: "FRESH", nature: "COMMUNITY_REPORT" });
    expect(s.supportingEvidenceIds.sort()).toEqual(["a", "b"]);
    expect(s.observedAt).toBe(NOW - 2 * min);
  });

  it("P2: an authoritative source establishes KNOWN alone and keeps FORECAST nature (P7)", () => {
    const s = evaluateState("WEATHER", [provider("w", "RAIN_HEAVY")], NOW);
    expect(s).toMatchObject({ truth: "KNOWN", value: "RAIN_HEAVY", safety: "CAUTION", nature: "FORECAST" });
  });

  it("P4: credible disagreement is CONFLICT, safety NONE, and is independent from freshness (CONFLICT + FRESH)", () => {
    const s = evaluateState("ROAD", [
      community("a", "BLOCKED", "u1"), community("b", "BLOCKED", "u2"),
      community("c", "CLEAR", "u3"), community("d", "CLEAR", "u4"),
    ], NOW);
    expect(s).toMatchObject({ truth: "CONFLICT", value: null, safety: "NONE", freshness: "FRESH", reason: "CREDIBLE_DISAGREEMENT" });
  });

  it("a weak contradiction does not create a conflict but is still surfaced as a signal", () => {
    const s = evaluateState("WEATHER", [provider("w", "CLEAR"), community("c", "THUNDERSTORM", "u1")], NOW);
    expect(s.truth).toBe("KNOWN");
    expect(s.value).toBe("CLEAR");
    expect(s.signals).toEqual([expect.objectContaining({ value: "THUNDERSTORM" })]);
  });

  it("P6: freshness follows the newest supporting observation and the domain windows", () => {
    expect(evaluateState("ROAD", [community("a", "SLOW", "u1", 20), community("b", "SLOW", "u2", 16)], NOW).freshness).toBe("AGING");
    expect(evaluateState("ROAD", [community("a", "SLOW", "u1", 60), community("b", "SLOW", "u2", 50)], NOW).freshness).toBe("STALE");
  });

  it("rejects values outside the domain catalog and evidence observed in the future", () => {
    expect(evaluateState("ROAD", [provider("x", "RAIN_HEAVY")], NOW).reason).toBe("NO_ACTIVE_EVIDENCE");
    expect(evaluateState("WEATHER", [provider("x", "CLEAR", -5)], NOW).reason).toBe("NO_ACTIVE_EVIDENCE");
  });

  it("low-reliability non-community sources cannot establish truth alone", () => {
    const s = evaluateState("WEATHER", [provider("w", "CLEAR", 1, { sourceReliability: 0.3 })], NOW);
    expect(s.truth).toBe("UNKNOWN");
  });
});

describe("impact severity thresholds", () => {
  it("maps only KNOWN hazards above MINOR; uncertainty never escalates", () => {
    expect(severityOf({ truth: "KNOWN", safety: "BLOCKED", domain: "ROAD", value: "BLOCKED" })).toBe("SAFETY_CRITICAL");
    expect(severityOf({ truth: "KNOWN", safety: "AVOID", domain: "ROAD", value: "FLOODED_MODERATE" })).toBe("SIGNIFICANT");
    expect(severityOf({ truth: "KNOWN", safety: "CAUTION", domain: "ROAD", value: "ACCIDENT" })).toBe("MINOR");
    expect(severityOf({ truth: "KNOWN", safety: "NONE", domain: "ROAD", value: "CONGESTED" })).toBe("MINOR");
    expect(severityOf({ truth: "CONFLICT", safety: "NONE", domain: "ROAD", value: null })).toBe("MINOR");
    expect(severityOf({ truth: "KNOWN", safety: "NONE", domain: "PARKING", value: "FULL" })).toBe("MINOR");
    expect(severityOf({ truth: "KNOWN", safety: "NONE", domain: "PARKING", value: "AVAILABLE" })).toBe("INFO");
    expect(severityOf({ truth: "UNKNOWN", safety: "NONE", domain: "ROAD", value: null })).toBe("INFO");
    expect(severityOf({ truth: "UNKNOWN", safety: "NONE", domain: "ROAD", value: null, verifiedIncident: true })).toBe("SAFETY_CRITICAL");
  });
});
