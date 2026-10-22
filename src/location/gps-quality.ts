/** E-04B: pure, fail-closed GPS quality. No GPS hooks or UI. */
export type GPSQualityInput = {
  latitude?: number; longitude?: number; accuracyMeters?: number;
  observedAt?: number; evaluatedAt: number;
  source: "WATCH" | "LAST_KNOWN" | "UNKNOWN";
  permission: "GRANTED" | "DENIED" | "UNKNOWN";
  servicesEnabled: boolean | null;
  appState: "FOREGROUND" | "BACKGROUND" | "UNKNOWN";
  /** Android `isFromMockProvider`. iOS/web never report it: absence means UNKNOWN, not genuine. */
  mocked?: boolean;
};
export type GPSQualityPolicy = {
  maxAccuracyMeters: number; maxAgeMs: number; maxFutureSkewMs: number;
};
export type GPSQualityClassification = "INVALID" | "UNAVAILABLE" | "STALE" | "LOW_ACCURACY" | "CANDIDATE" | "UNVERIFIED";
export type GPSQualityReason =
  | "INVALID_EVALUATION_TIME" | "INVALID_COORDINATES" | "INVALID_ACCURACY" | "INVALID_TIMESTAMP"
  | "PERMISSION_DENIED" | "PERMISSION_UNKNOWN" | "SERVICES_DISABLED" | "SERVICES_UNKNOWN"
  | "BACKGROUND" | "APP_STATE_UNKNOWN" | "CACHED_FIX" | "SOURCE_UNKNOWN"
  | "MISSING_ACCURACY" | "MISSING_TIMESTAMP" | "POLICY_NOT_APPROVED" | "INVALID_POLICY"
  | "FUTURE_TIMESTAMP" | "STALE_FIX" | "LOW_ACCURACY_FIX" | "MOCK_LOCATION";
export type GPSQualityResult = {
  classification: GPSQualityClassification;
  /** Never enables navigation; Start Gate remains separately blocked. */
  navigationEligible: false;
  reasons: readonly GPSQualityReason[];
};
function validPolicy(p: GPSQualityPolicy): boolean {
  return Number.isFinite(p.maxAccuracyMeters) && p.maxAccuracyMeters > 0 &&
    Number.isFinite(p.maxAgeMs) && p.maxAgeMs > 0 &&
    Number.isFinite(p.maxFutureSkewMs) && p.maxFutureSkewMs >= 0;
}
export function evaluateGPSQuality(input: GPSQualityInput, policy?: GPSQualityPolicy): GPSQualityResult {
  const reasons: GPSQualityReason[] = [];
  const add = (r: GPSQualityReason) => { if (!reasons.includes(r)) reasons.push(r); };
  if (!Number.isFinite(input.evaluatedAt) || input.evaluatedAt < 0) add("INVALID_EVALUATION_TIME");
  if (input.latitude === undefined || input.longitude === undefined ||
    !Number.isFinite(input.latitude) || !Number.isFinite(input.longitude) ||
    input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180) add("INVALID_COORDINATES");
  if (input.accuracyMeters !== undefined && (!Number.isFinite(input.accuracyMeters) || input.accuracyMeters < 0)) add("INVALID_ACCURACY");
  if (input.observedAt !== undefined && (!Number.isFinite(input.observedAt) || input.observedAt < 0)) add("INVALID_TIMESTAMP");
  if (input.mocked === true) add("MOCK_LOCATION");
  if (reasons.length) return { classification: "INVALID", navigationEligible: false, reasons };
  if (input.permission === "DENIED") add("PERMISSION_DENIED");
  if (input.permission === "UNKNOWN") add("PERMISSION_UNKNOWN");
  if (input.servicesEnabled === false) add("SERVICES_DISABLED");
  if (input.servicesEnabled === null) add("SERVICES_UNKNOWN");
  if (input.appState === "BACKGROUND") add("BACKGROUND");
  if (input.appState === "UNKNOWN") add("APP_STATE_UNKNOWN");
  if (reasons.length) return { classification: "UNAVAILABLE", navigationEligible: false, reasons };
  if (input.source === "LAST_KNOWN") add("CACHED_FIX");
  if (input.source === "UNKNOWN") add("SOURCE_UNKNOWN");
  if (input.accuracyMeters === undefined) add("MISSING_ACCURACY");
  if (input.observedAt === undefined) add("MISSING_TIMESTAMP");
  if (reasons.length) return { classification: "UNVERIFIED", navigationEligible: false, reasons };
  if (!policy) return { classification: "UNVERIFIED", navigationEligible: false, reasons: ["POLICY_NOT_APPROVED"] };
  if (!validPolicy(policy)) return { classification: "UNVERIFIED", navigationEligible: false, reasons: ["INVALID_POLICY"] };
  if (input.observedAt! > input.evaluatedAt + policy.maxFutureSkewMs)
    return { classification: "INVALID", navigationEligible: false, reasons: ["FUTURE_TIMESTAMP"] };
  if (input.evaluatedAt - input.observedAt! > policy.maxAgeMs)
    return { classification: "STALE", navigationEligible: false, reasons: ["STALE_FIX"] };
  if (input.accuracyMeters! > policy.maxAccuracyMeters)
    return { classification: "LOW_ACCURACY", navigationEligible: false, reasons: ["LOW_ACCURACY_FIX"] };
  return { classification: "CANDIDATE", navigationEligible: false, reasons: [] };
}

/**
 * Owner-approved display policy (REALITY V2 master order, 2026-10-22, §8):
 * - future timestamp skew <= 2 000 ms accepted; greater skew rejected as a clock error;
 * - position age > 30 000 ms rejected for readiness;
 * - explicit mocked=true never reaches READY;
 * - missing mock metadata stays UNKNOWN (never reported as proven genuine).
 */
export const APPROVED_DISPLAY_FIX_POLICY = { maxFutureSkewMs: 2_000, maxAgeMs: 30_000 } as const;
export type MockStatus = "REPORTED_NOT_MOCKED" | "UNKNOWN";
export type DisplayFixDecision =
  | { accept: true; mockStatus: MockStatus; ageMs: number }
  | { accept: false; reason: "MOCK_LOCATION" | "FUTURE_TIMESTAMP" | "STALE_FIX" | "INVALID_TIMESTAMP" };

export function evaluateDisplayFix(input: { observedAt: number; evaluatedAt: number; mocked?: boolean | null }): DisplayFixDecision {
  if (input.mocked === true) return { accept: false, reason: "MOCK_LOCATION" };
  if (!Number.isFinite(input.observedAt) || !Number.isFinite(input.evaluatedAt) || input.observedAt < 0) {
    return { accept: false, reason: "INVALID_TIMESTAMP" };
  }
  const ageMs = input.evaluatedAt - input.observedAt;
  if (-ageMs > APPROVED_DISPLAY_FIX_POLICY.maxFutureSkewMs) return { accept: false, reason: "FUTURE_TIMESTAMP" };
  if (ageMs > APPROVED_DISPLAY_FIX_POLICY.maxAgeMs) return { accept: false, reason: "STALE_FIX" };
  return { accept: true, mockStatus: input.mocked === false ? "REPORTED_NOT_MOCKED" : "UNKNOWN", ageMs: Math.max(0, ageMs) };
}
