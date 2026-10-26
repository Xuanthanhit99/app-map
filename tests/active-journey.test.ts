import { describe, expect, it } from "vitest";
import { buildActiveJourneyViewModel } from "../src/features/journey/active-journey";
import type { ComposableState } from "../src/domain/state-model";
import type { RoadState } from "../src/domain/domain-states";

const road: ComposableState<RoadState> = {
  domain: "FLOODED_MODERATE",
  truthStatus: "KNOWN",
  freshness: "FRESH",
  systemAvailability: "ERROR",
  permission: "GRANTED",
  contentAvailability: "CONTENT",
  interactionLifecycle: "NONE",
  fetchLifecycle: "IDLE",
  safetyLevel: "CAUTION",
};

describe("Active Journey", () => {
  it("degrades gracefully when Reality updates fail", () => {
    const view = buildActiveJourneyViewModel({
      maneuver: { distanceMeters: 300, instruction: "Rẽ phải vào Nguyễn Trãi" },
      etaMinutes: 18,
      roadAhead: road,
      responsive: { widthClass: "LARGE_PHONE", orientation: "PORTRAIT", dynamicTypeScale: 1 },
    });

    expect(view.continueNavigationOnRealityError).toBe(true);
    expect(view.backgroundRealityRetry).toBe(true);
  });

  it("reflows at 200% text by dropping secondary ETA", () => {
    const view = buildActiveJourneyViewModel({
      maneuver: { distanceMeters: 300, instruction: "Rẽ phải vào Nguyễn Trãi" },
      etaMinutes: 18,
      responsive: { widthClass: "SMALL_PHONE", orientation: "PORTRAIT", dynamicTypeScale: 2 },
    });

    expect(view.etaMinutes).toBeUndefined();
  });
});
