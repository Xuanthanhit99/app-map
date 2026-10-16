import { evaluateEvidence, type DecisionPlan, type EvidenceRecord } from "./decision-engine";

export type VerifiedRoute = {
  planId: string;
  stopPlaceIds: string[];
  routeId: string;
  evidence: EvidenceRecord;
};

/** A recommendation is not a navigable journey. Require a separately verified route. */
export function canStartJourney(plan: DecisionPlan | null | undefined, route: VerifiedRoute | null | undefined, now = Date.now()): boolean {
  if (!plan || !route || !route.routeId?.trim() || plan.id !== route.planId) return false;
  if (!plan.stops.length || plan.stops.some((stop) => !stop.placeId?.trim())) return false;
  if (route.stopPlaceIds.length !== plan.stops.length ||
      route.stopPlaceIds.some((id, index) => id !== plan.stops[index]?.placeId)) return false;
  return evaluateEvidence(plan.evidence, now).safeToAssert &&
    evaluateEvidence(route.evidence, now).safeToAssert;
}

/** Routing gateway SUCCESS is necessary but not sufficient: route evidence must be independently sourced. */
export function canStartWithRoutingResult(
  plan: DecisionPlan | null | undefined,
  route: VerifiedRoute | null | undefined,
  routingResult: import("../../../src/routing/routing-contract").RoutingResult | null | undefined,
  now = Date.now(),
): boolean {
  if (!canStartJourney(plan, route, now) || !routingResult || routingResult.status !== "SUCCESS") return false;
  return Boolean(routingResult.provider.trim()) &&
    Number.isFinite(routingResult.distanceMeters) && routingResult.distanceMeters > 0 &&
    Number.isFinite(routingResult.durationSeconds) && routingResult.durationSeconds > 0;
}
