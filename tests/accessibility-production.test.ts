import { describe, expect, it } from "vitest";
import { assertTouchTarget, buildMapAlternative, resolveMotion } from "../src/accessibility/production-contract";
import { validateCriticalNodes } from "../src/accessibility/focus-contract";

describe("accessibility production contract", () => {
  it("requires production touch targets", () => {
    expect(assertTouchTarget(48)).toBe(true);
    expect(assertTouchTarget(44)).toBe(false);
    expect(assertTouchTarget(56, true)).toBe(true);
    expect(assertTouchTarget(48, true)).toBe(false);
  });

  it("removes spatial motion when reduced motion is requested", () => {
    expect(resolveMotion({ reduceMotion: true })).toEqual({
      mapCamera: "instant",
      sheet: "crossfade",
      warning: "static",
      parallax: false,
    });
  });

  it("rejects color-only alerts", () => {
    const errors = validateCriticalNodes([
      { id: "flood", role: "alert", label: "Ngập vừa phía trước", order: 1, minimumTargetDp: 56 },
    ]);
    expect(errors).toContain("flood: alert depends on color");
  });

  it("provides a structured equivalent for map-only information", () => {
    const alt = buildMapAlternative({
      heading: "Tình trạng quanh bạn",
      summary: "2 tín hiệu gần đây",
      items: [
        { id: "r1", label: "Nguyễn Trãi", distanceText: "300 m", stateText: "Ngập vừa, 3 phút trước" },
        { id: "p1", label: "Bãi xe A", distanceText: "500 m", stateText: "Còn ít chỗ, 5 phút trước" },
      ],
    });
    expect(alt.items).toHaveLength(2);
    expect(alt.items[0]?.stateText).toContain("3 phút");
  });
});
