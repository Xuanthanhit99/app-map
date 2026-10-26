import { describe, expect, it } from "vitest";
import { selectFloodSeverity, selectMovingReportType, startMovingContribution } from "../src/features/contribution/moving-safe";

describe("moving-safe contribution", () => {
  it("submits non-flood reports in one selection", () => {
    expect(startMovingContribution().step).toBe("TYPE");
    expect(selectMovingReportType("ACCIDENT").step).toBe("SUBMITTED");
  });

  it("submits flood reports in at most two selections", () => {
    expect(selectMovingReportType("FLOOD").step).toBe("FLOOD_SEVERITY");
    const submitted = selectFloodSeverity("MODERATE");
    expect(submitted.step).toBe("SUBMITTED");
    if (submitted.step === "SUBMITTED") {
      expect(submitted.deferDetailsUntilStationary).toBe(true);
    }
  });
});
