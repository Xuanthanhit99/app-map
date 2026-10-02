import { describe, expect, it } from "vitest";
import { activeJourneyLocationNotice } from "../src/location/active-journey-location";

describe("active journey location presentation", () => {
  it("explains degraded location without implying a fresh route", () => {
    const notice = activeJourneyLocationNotice({
      status: "DEGRADED",
      lastKnown: { latitude: 21.02, longitude: 105.83, observedAt: 1 },
      reason: "STALE",
    });
    expect(notice).toContain("kém tin cậy");
    expect(notice).toContain("chưa yêu cầu tuyến đường mới");
  });

  it("preserves denied and unavailable journey guidance", () => {
    expect(activeJourneyLocationNotice({ status: "DENIED", canAskAgain: true })).toContain("Chưa có quyền vị trí");
    expect(activeJourneyLocationNotice({ status: "UNAVAILABLE", reason: "NO_FIX" })).toContain("chưa xác định được vị trí");
  });

  it("does not show a degraded notice for a ready fix", () => {
    expect(activeJourneyLocationNotice({ status: "READY", latitude: 21.02, longitude: 105.83, observedAt: 1 })).toBeUndefined();
  });
});
