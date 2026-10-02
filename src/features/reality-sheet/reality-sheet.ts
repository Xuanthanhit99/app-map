import type { ComposableState } from "../../domain/state-model";
import type { ParkingAvailability, RoadState } from "../../domain/domain-states";
import { resolveParkingPresentation, resolveRoadPresentation } from "../../presentation/domain-resolvers";
import { getDetailContainer, type ResponsiveContract } from "../../responsive/layout-contract";

export type RealitySheetSubject =
  | { kind: "ROAD"; state: ComposableState<RoadState> }
  | { kind: "PARKING"; state: ComposableState<ParkingAvailability> };

export function buildRealitySheet(subject: RealitySheetSubject, responsive: ResponsiveContract) {
  const presentation = subject.kind === "ROAD"
    ? resolveRoadPresentation(subject.state)
    : resolveParkingPresentation(subject.state);

  return {
    container: getDetailContainer(responsive),
    presentation,
    evidence: subject.state.provenance ?? [],
    showAskHere:
      subject.state.truthStatus === "UNKNOWN" ||
      subject.state.freshness === "STALE" ||
      subject.state.truthStatus === "CONFLICT",
    showRawTrustScore: false,
  };
}
