import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolvePresentation } from "../src/presentation/presentation-resolver";
import type { ComposableState, SafetyLevel, TruthStatus } from "../src/domain/state-model";
import { formatDurationVi } from "../apps/mobile/src/features/journey/formatDuration";
import { createLatestRequestGate } from "../apps/mobile/src/features/journey/latestRequestGate";

function state(truthStatus: TruthStatus, safetyLevel: SafetyLevel, contentAvailability: "CONTENT" | "EMPTY" = "CONTENT"): ComposableState<string> {
  return {
    domain: "X", truthStatus, safetyLevel, contentAvailability,
    systemAvailability: "ONLINE", permission: "NOT_REQUIRED",
    interactionLifecycle: "NONE", fetchLifecycle: "IDLE",
  };
}

describe("P0: hard safety precedence is never downgraded", () => {
  it.each([["UNKNOWN"], ["CONFLICT"], ["KNOWN"]] as const)("BLOCKED keeps danger tone when truth is %s", (truth) => {
    expect(resolvePresentation(state(truth, "BLOCKED"), { domainLabel: "Đường" }).tone).toBe("danger");
  });
  it("UNKNOWN + AVOID stays caution and still reads as unknown, not safe", () => {
    const p = resolvePresentation(state("UNKNOWN", "AVOID"), { domainLabel: "Đường" });
    expect(p.tone).toBe("caution");
    expect(p.badges).toContain("UNKNOWN");
  });
  it("EMPTY + BLOCKED keeps danger tone", () => {
    expect(resolvePresentation(state("KNOWN", "BLOCKED", "EMPTY"), { domainLabel: "Đường" }).tone).toBe("danger");
  });
  it("without safety consequence UNKNOWN remains uncertainty and CONFLICT is not danger", () => {
    expect(resolvePresentation(state("UNKNOWN", "NONE"), { domainLabel: "Đường" }).tone).toBe("uncertainty");
    expect(resolvePresentation(state("CONFLICT", "NONE"), { domainLabel: "Đường" }).tone).toBe("uncertainty");
  });
});

describe("P0: Journey ETA formatting", () => {
  it.each([
    [7170, "2 giờ"], [3599, "1 giờ"], [3660, "1 giờ 1 phút"], [5400, "1 giờ 30 phút"],
    [29, "1 phút"], [600, "10 phút"],
  ])("%is -> %s", (seconds, expected) => {
    expect(formatDurationVi(seconds)).toBe(expected);
  });
  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid duration %s", (value) => {
    expect(formatDurationVi(value)).toBeNull();
  });
  it("never renders a 60-minute remainder", () => {
    for (let s = 1; s < 86_400; s += 7) expect(formatDurationVi(s)).not.toMatch(/\b60 phút/);
  });
});

describe("P0: Journey decision requests are latest-wins", () => {
  it("a slow initial read cannot overwrite a later consented query", () => {
    const gate = createLatestRequestGate();
    const initial = gate.begin();
    const query = gate.begin();
    expect(gate.isCurrent(initial)).toBe(false);
    expect(gate.isCurrent(query)).toBe(true);
    gate.invalidate();
    expect(gate.isCurrent(query)).toBe(false);
  });
  it("Journey screen routes both requests through the gate", () => {
    const source = readFileSync("apps/mobile/app/(tabs)/journey.tsx", "utf8");
    expect(source).toContain("createLatestRequestGate()");
    expect(source.match(/decisionGate\.begin\(\)/g)?.length).toBe(2);
    expect(source).toContain("decisionGate.invalidate()");
    expect(source).not.toMatch(/% 3600\) \/ 60/);
  });
});
