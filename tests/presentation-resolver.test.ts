import { describe, expect, it } from "vitest";
import { resolveParkingPresentation, resolveRoadPresentation } from "../src/presentation/domain-resolvers";
import type { ComposableState } from "../src/domain/state-model";
import type { ParkingAvailability, RoadState } from "../src/domain/domain-states";

function base<TDomain>(domain: TDomain): ComposableState<TDomain> {
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

describe("presentation resolver", () => {
  it("preserves domain headline when fresh data is offline", () => {
    const state = base<ParkingAvailability>("LIMITED");
    state.systemAvailability = "OFFLINE";
    state.cached = true;

    const view = resolveParkingPresentation(state);
    expect(view.headline).toBe("Còn ít chỗ");
    expect(view.supportingText).toContain("Đang xem dữ liệu đã lưu");
    expect(view.badges).toContain("OFFLINE");
  });

  it("never treats UNKNOWN as safe", () => {
    const state = base<RoadState>("CLEAR");
    state.truthStatus = "UNKNOWN";

    const view = resolveRoadPresentation(state);
    expect(view.headline).toBe("Chưa rõ tình trạng");
    expect(view.headline).not.toContain("thông thoáng");
    expect(view.tone).toBe("uncertainty");
  });

  it("uses uncertainty semantics for conflict", () => {
    const state = base<RoadState>("FLOODED_MODERATE");
    state.truthStatus = "CONFLICT";
    state.safetyLevel = "NONE";

    const view = resolveRoadPresentation(state);
    expect(view.headline).toBe("Thông tin đang mâu thuẫn");
    expect(view.tone).toBe("uncertainty");
  });

  it("downgrades stale parking FULL from current truth wording", () => {
    const state = base<ParkingAvailability>("FULL");
    state.freshness = "STALE";

    const view = resolveParkingPresentation(state);
    expect(view.headline).toBe("Từng ghi nhận bãi đầy");
    expect(view.supportingText).toContain("Thông tin có thể đã thay đổi");
  });

  it("permission denied does not make unrelated domain unavailable", () => {
    const state = base<RoadState>("SLOW");
    state.permission = "DENIED";

    const view = resolveRoadPresentation(state);
    expect(view.headline).toBe("Di chuyển chậm");
    expect(view.supportingText).toContain("cá nhân hóa");
  });
});
