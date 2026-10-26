import { describe, expect, it } from "vitest";
import { createGPSLifecycleContract, normalizeGPSPosition } from "../src/location/gps-lifecycle-contract";
import type { GPSQualityPolicy } from "../src/location/gps-quality";

const policy: GPSQualityPolicy = { maxAccuracyMeters: 30, maxAgeMs: 10_000, maxFutureSkewMs: 1_000 }; // test fixture, not approved policy
const foreground = { permission: "GRANTED" as const, servicesEnabled: true, appState: "FOREGROUND" as const };
const watch = { coords: { latitude: 21.02, longitude: 105.83, accuracy: 10 }, timestamp: 100_000 };

describe("E-04C GPS lifecycle contract - fail closed", () => {
  it("preserves WATCH provenance and never enables navigation", () => {
    const gate = createGPSLifecycleContract();
    const token = gate.start()!;
    const result = gate.accept(token, watch, "WATCH", foreground, 101_000, policy)!;
    expect(result.input.source).toBe("WATCH");
    expect(result.quality).toMatchObject({ classification: "CANDIDATE", navigationEligible: false });
  });
  it("preserves LAST_KNOWN and rejects cached fix for navigation", () => {
    const gate = createGPSLifecycleContract();
    const result = gate.accept(gate.start()!, watch, "LAST_KNOWN", foreground, 101_000, policy)!;
    expect(result.quality).toMatchObject({ classification: "UNVERIFIED", navigationEligible: false, reasons: ["CACHED_FIX"] });
  });
  it("normalizes null accuracy and timestamp as missing, not fabricated", () => {
    const input = normalizeGPSPosition({ coords: { latitude: 21, longitude: 105, accuracy: null }, timestamp: null }, "WATCH", foreground, 101_000);
    expect(input.accuracyMeters).toBeUndefined();
    expect(input.observedAt).toBeUndefined();
  });
  it("does not turn missing coordinates into a valid fix", () => {
    const gate = createGPSLifecycleContract();
    const result = gate.accept(gate.start()!, { coords: null }, "WATCH", foreground, 101_000, policy)!;
    expect(result.quality.classification).toBe("INVALID");
  });
  it("rejects old async callback after background and restart", () => {
    const gate = createGPSLifecycleContract();
    const oldToken = gate.start()!;
    gate.background();
    expect(gate.current()).toBeNull();
    expect(gate.accept(oldToken, watch, "WATCH", foreground, 101_000, policy)).toBeNull();
    const newToken = gate.start()!;
    expect(gate.accept(oldToken, watch, "WATCH", foreground, 101_000, policy)).toBeNull();
    expect(gate.accept(newToken, watch, "WATCH", foreground, 101_000, policy)?.quality.classification).toBe("CANDIDATE");
  });
  it("rejects background context even if token is current", () => {
    const gate = createGPSLifecycleContract();
    const token = gate.start()!;
    expect(gate.accept(token, watch, "WATCH", { ...foreground, appState: "BACKGROUND" }, 101_000, policy)).toBeNull();
    expect(gate.current()).toBeNull();
  });
  it("prevents cached fix from replacing a live watch fix", () => {
    const gate = createGPSLifecycleContract();
    const token = gate.start()!;
    const live = gate.accept(token, watch, "WATCH", foreground, 101_000, policy)!;
    expect(gate.accept(token, { ...watch, timestamp: 99_000 }, "LAST_KNOWN", foreground, 101_000, policy)).toBe(live);
    expect(gate.current()?.source).toBe("WATCH");
  });
  it("classifies stale WATCH by timestamp rather than arrival time", () => {
    const gate = createGPSLifecycleContract();
    const result = gate.accept(gate.start()!, watch, "WATCH", foreground, 120_000, policy)!;
    expect(result.quality).toMatchObject({ classification: "STALE", navigationEligible: false });
  });
  it("keeps missing policy unverified", () => {
    const gate = createGPSLifecycleContract();
    const result = gate.accept(gate.start()!, watch, "WATCH", foreground, 101_000)!;
    expect(result.quality).toMatchObject({ classification: "UNVERIFIED", navigationEligible: false, reasons: ["POLICY_NOT_APPROVED"] });
  });
  it("disposal rejects every callback and new start", () => {
    const gate = createGPSLifecycleContract();
    const token = gate.start()!;
    gate.dispose();
    expect(gate.start()).toBeNull();
    expect(gate.accept(token, watch, "WATCH", foreground, 101_000, policy)).toBeNull();
    expect(gate.current()).toBeNull();
  });
});
