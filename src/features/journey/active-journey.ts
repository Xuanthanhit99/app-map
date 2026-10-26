import type { ComposableState } from "../../domain/state-model";
import type { RoadState } from "../../domain/domain-states";
import { resolveRoadPresentation } from "../../presentation/domain-resolvers";
import { getDetailContainer, isHighDynamicType, type ResponsiveContract } from "../../responsive/layout-contract";

export interface Maneuver {
  distanceMeters: number;
  instruction: string;
}

export function buildActiveJourneyViewModel(input: {
  maneuver: Maneuver;
  etaMinutes: number;
  roadAhead?: ComposableState<RoadState>;
  responsive: ResponsiveContract;
}) {
  const roadAhead = input.roadAhead ? resolveRoadPresentation(input.roadAhead) : undefined;
  const highText = isHighDynamicType(input.responsive);

  return {
    maneuver: input.maneuver,
    etaMinutes: highText ? undefined : input.etaMinutes,
    roadAhead,
    layout: getDetailContainer(input.responsive),
    priorities: ["MANEUVER", "SAFETY_REALITY", "ETA"] as const,
    continueNavigationOnRealityError: true,
    backgroundRealityRetry: input.roadAhead?.systemAvailability === "ERROR",
  };
}
