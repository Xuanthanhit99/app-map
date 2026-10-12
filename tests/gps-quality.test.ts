import { describe, expect, it } from "vitest";
import { evaluateGPSQuality, type GPSQualityInput, type GPSQualityPolicy } from "../src/location/gps-quality";

// Fixture thresholds ONLY, not approved production limits.
const policy: GPSQualityPolicy = { maxAccuracyMeters: 30, maxAgeMs: 10_000, maxFutureSkewMs: 1_000 };
const sample: GPSQualityInput = {
  latitude: 21.02, longitude: 105.83, accuracyMeters: 10,
  observedAt: 100_000, evaluatedAt: 101_000,
  source: "WATCH", permission: "GRANTED", servicesEnabled: true, appState: "FOREGROUND",
};
const check = (overrides: Partial<GPSQualityInput> = {}, p: GPSQualityPolicy | undefined = policy) =>
  evaluateGPSQuality({ ...sample, ...overrides }, p);

describe("E-04B GPS quality evaluator Ã¢â‚¬â€ fail closed", () => {
  it("rejects invalid latitude", () => expect(check({ latitude: 91 }).classification).toBe("INVALID"));
  it("rejects invalid longitude", () => expect(check({ longitude: -181 }).classification).toBe("INVALID"));
  it("rejects NaN coordinate", () => expect(check({ latitude: NaN }).classification).toBe("INVALID"));
  it("rejects missing coordinate", () => expect(check(Object.fromEntries(Object.entries(sample).filter(([key]) => key !== 'longitude')) as Partial<GPSQualityInput>).classification).toBe("INVALID"));
  it("rejects negative accuracy", () => expect(check({ accuracyMeters: -1 }).classification).toBe("INVALID"));
  it("rejects nonfinite accuracy", () => expect(check({ accuracyMeters: Infinity }).classification).toBe("INVALID"));
  it("rejects invalid timestamp", () => expect(check({ observedAt: -1 }).classification).toBe("INVALID"));
  it("rejects invalid evaluation time", () => expect(check({ evaluatedAt: NaN }).classification).toBe("INVALID"));
  it("blocks denied permission", () => expect(check({ permission: "DENIED" }).classification).toBe("UNAVAILABLE"));
  it("blocks unknown permission", () => expect(check({ permission: "UNKNOWN" }).classification).toBe("UNAVAILABLE"));
  it("blocks disabled services", () => expect(check({ servicesEnabled: false }).classification).toBe("UNAVAILABLE"));
  it("blocks unknown services", () => expect(check({ servicesEnabled: null }).classification).toBe("UNAVAILABLE"));
  it("blocks background", () => expect(check({ appState: "BACKGROUND" }).classification).toBe("UNAVAILABLE"));
  it("blocks unknown app state", () => expect(check({ appState: "UNKNOWN" }).classification).toBe("UNAVAILABLE"));
  it("blocks cached fix", () => expect(check({ source: "LAST_KNOWN" })).toMatchObject({ classification: "UNVERIFIED", reasons: ["CACHED_FIX"] }));
  it("blocks unknown source", () => expect(check({ source: "UNKNOWN" }).classification).toBe("UNVERIFIED"));
  it("blocks missing accuracy", () => expect(check(Object.fromEntries(Object.entries(sample).filter(([key]) => key !== 'accuracyMeters')) as Partial<GPSQualityInput>).classification).toBe("UNVERIFIED"));
  it("blocks missing timestamp", () => expect(check(Object.fromEntries(Object.entries(sample).filter(([key]) => key !== 'observedAt')) as Partial<GPSQualityInput>).classification).toBe("UNVERIFIED"));
  it("requires approved policy", () => expect(evaluateGPSQuality(sample)).toMatchObject({ classification: "UNVERIFIED", reasons: ["POLICY_NOT_APPROVED"] }));
  it("rejects invalid policy", () => expect(check({}, { ...policy, maxAgeMs: 0 }).classification).toBe("UNVERIFIED"));
  it("rejects future timestamp", () => expect(check({ observedAt: 103_000 }).classification).toBe("INVALID"));
  it("classifies stale timestamp", () => expect(check({ observedAt: 90_000 }).classification).toBe("STALE"));
  it("classifies low accuracy", () => expect(check({ accuracyMeters: 31 }).classification).toBe("LOW_ACCURACY"));
  it("foreground watch can only be candidate", () => expect(check()).toEqual({ classification: "CANDIDATE", navigationEligible: false, reasons: [] }));
  it("never enables navigation", () => {
    const results = [check(), check({ source: "LAST_KNOWN" }), check({ latitude: 999 }), check({ appState: "BACKGROUND" }), check({ observedAt: 0 }), evaluateGPSQuality(sample)];
    expect(results.every((r) => r.navigationEligible === false)).toBe(true);
  });
});
