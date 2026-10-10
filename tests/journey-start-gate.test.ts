import { describe, expect, it } from "vitest";
import { canStartJourney, canStartWithRoutingResult } from "../apps/api/src/journey-start-gate";
import type { DecisionPlan } from "../apps/api/src/decision-engine";

const now = Date.parse("2026-10-09T04:00:00Z");
const evidence = { truth: "KNOWN" as const, source: "provider", provenanceId: "record-1", observedAt: "2026-10-09T03:59:00Z" };
const plan: DecisionPlan = { id: "plan-1", title: "Verified destination", stops: [{ placeId: "place-1" }], evidence: { ...evidence, freshness: "FRESH" } };
const route = { planId: "plan-1", stopPlaceIds: ["place-1"], routeId: "route-1", evidence };

describe("journey start gate", () => {
  it("disables start when Decision is empty or route is missing", () => {
    expect(canStartJourney(null, null, now)).toBe(false);
    expect(canStartJourney(plan, null, now)).toBe(false);
  });
  it("requires exact plan and stop binding", () => {
    expect(canStartJourney(plan, { ...route, planId: "other" }, now)).toBe(false);
    expect(canStartJourney(plan, { ...route, stopPlaceIds: ["other"] }, now)).toBe(false);
  });
  it("rejects conflict, unknown and stale routes", () => {
    expect(canStartJourney(plan, { ...route, evidence: { ...evidence, truth: "CONFLICT" } }, now)).toBe(false);
    expect(canStartJourney(plan, { ...route, evidence: { ...evidence, truth: "UNKNOWN" } }, now)).toBe(false);
    expect(canStartJourney(plan, { ...route, evidence: { ...evidence, observedAt: "2026-10-09T03:00:00Z" } }, now)).toBe(false);
  });
  it("accepts only independently verified plan and matching route", () => {
    expect(canStartJourney(plan, route, now)).toBe(true);
  });
  it("requires routing SUCCESS with positive distance and duration", () => {
    const success = { status: "SUCCESS" as const, provider: "verified-routing", distanceMeters: 1200, durationSeconds: 900, route: { coordinates: [] } as never };
    expect(canStartWithRoutingResult(plan, route, null, now)).toBe(false);
    expect(canStartWithRoutingResult(plan, route, { status: "FAILURE", reason: "NO_ROUTE", retryable: false, provider: "verified-routing" }, now)).toBe(false);
    expect(canStartWithRoutingResult(plan, route, { ...success, distanceMeters: 0 }, now)).toBe(false);
    expect(canStartWithRoutingResult(plan, route, success, now)).toBe(true);
  });
});
