import { describe, expect, it } from "vitest";
import { buildPlaceNowViewModel, type PlaceNowState } from "../src/features/place-now/place-now";

function place(): PlaceNowState {
  return {
    facts: { id: "p1", name: "Quán A", category: "CAFE" },
    live: {
      domain: { open: "OPEN", crowd: "BUSY", queue: "SHORT", availableSeating: "LIMITED" },
      truthStatus: "KNOWN",
      freshness: "FRESH",
      systemAvailability: "ONLINE",
      permission: "NOT_REQUIRED",
      contentAvailability: "CONTENT",
      interactionLifecycle: "NONE",
      fetchLifecycle: "IDLE",
      safetyLevel: "NONE",
      provenance: [{ sourceType: "COMMUNITY", observedAt: "2026-10-01T08:00:00Z" }],
    },
  };
}

describe("Place Now", () => {
  it("leads with the current situation, not static place facts", () => {
    const vm = buildPlaceNowViewModel(place(), {
      widthClass: "LARGE_PHONE",
      orientation: "PORTRAIT",
      dynamicTypeScale: 1,
    });
    expect(vm.headline).toBe("Hiện đang đông");
    expect(vm.supportingText).toContain("Hàng chờ ngắn");
    expect(vm.supportingText).toContain("ít chỗ ngồi");
  });

  it("does not expose domain live values as truth when status is UNKNOWN", () => {
    const state = place();
    state.live.truthStatus = "UNKNOWN";
    const vm = buildPlaceNowViewModel(state, {
      widthClass: "LARGE_PHONE",
      orientation: "PORTRAIT",
      dynamicTypeScale: 1,
    });
    expect(vm.live).toBeNull();
    expect(vm.headline).toBe("Chưa rõ tình trạng hiện tại");
    expect(vm.showAskHere).toBe(true);
  });

  it("keeps conflict distinct from danger", () => {
    const state = place();
    state.live.truthStatus = "CONFLICT";
    const vm = buildPlaceNowViewModel(state, {
      widthClass: "TABLET",
      orientation: "LANDSCAPE",
      dynamicTypeScale: 1,
    });
    expect(vm.headline).toContain("mâu thuẫn");
    expect(vm.container).toBe("SIDE_INSPECTOR");
  });
});
