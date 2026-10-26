import { describe, expect, it } from "vitest";
import { buildRealityHomeViewModel } from "../src/features/reality-home/reality-home";
import type { ComposableState } from "../src/domain/state-model";
import type { RoadState } from "../src/domain/domain-states";

function road(domain: RoadState): ComposableState<RoadState> {
  return {
    domain,
    truthStatus: "KNOWN",
    freshness: "FRESH",
    systemAvailability: "ONLINE",
    permission: "GRANTED",
    contentAvailability: "CONTENT",
    interactionLifecycle: "NONE",
    fetchLifecycle: "IDLE",
    safetyLevel: "NONE",
  };
}

describe("Reality Home", () => {
  it("promotes high-value safety reality to the hero pulse", () => {
    const normal = road("CLEAR");
    const flood = road("FLOODED_MODERATE");
    flood.safetyLevel = "CAUTION";

    const view = buildRealityHomeViewModel(
      [
        { id: "normal", kind: "ROAD", state: normal, distanceMeters: 50 },
        { id: "flood", kind: "ROAD", state: flood, distanceMeters: 800 },
      ],
      { widthClass: "SMALL_PHONE", orientation: "PORTRAIT", dynamicTypeScale: 1 },
    );

    expect(view.pulse?.id).toBe("flood");
    expect(view.chrome.showShortcutRow).toBe(false);
  });

  it("does not claim empty reality means safe", () => {
    const view = buildRealityHomeViewModel([], {
      widthClass: "LARGE_PHONE",
      orientation: "PORTRAIT",
      dynamicTypeScale: 1,
    });

    expect(view.emptyMessage).toContain("không có nghĩa");
  });
});
