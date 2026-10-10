export type MovingReportType = "FLOOD" | "ACCIDENT" | "ROAD_BLOCKED";
export type FloodSeverity = "LIGHT" | "MODERATE" | "DEEP";

export type MovingContributionStep =
  | { step: "TYPE"; options: MovingReportType[] }
  | { step: "FLOOD_SEVERITY"; options: FloodSeverity[] }
  | { step: "SUBMITTED"; deferDetailsUntilStationary: true };

export function startMovingContribution(): MovingContributionStep {
  return { step: "TYPE", options: ["FLOOD", "ACCIDENT", "ROAD_BLOCKED"] };
}

export function selectMovingReportType(type: MovingReportType): MovingContributionStep {
  if (type === "FLOOD") {
    return { step: "FLOOD_SEVERITY", options: ["LIGHT", "MODERATE", "DEEP"] };
  }
  return { step: "SUBMITTED", deferDetailsUntilStationary: true };
}

export function selectFloodSeverity(_severity: FloodSeverity): MovingContributionStep {
  return { step: "SUBMITTED", deferDetailsUntilStationary: true };
}
