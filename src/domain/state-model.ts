export type TruthStatus = "KNOWN" | "UNKNOWN" | "CONFLICT";
export type Freshness = "FRESH" | "AGING" | "STALE";
export type SystemAvailability = "ONLINE" | "OFFLINE" | "DEGRADED" | "ERROR";
export type PermissionState = "GRANTED" | "LIMITED" | "DENIED" | "NOT_REQUIRED";
export type ContentAvailability = "CONTENT" | "EMPTY" | "NOT_APPLICABLE";
export type InteractionLifecycle =
  | "ACTION_REQUIRED"
  | "PENDING"
  | "ACTIONED"
  | "EXPIRED"
  | "DISMISSED"
  | "NONE";

export type FetchLifecycle =
  | "IDLE"
  | "INITIAL_LOADING"
  | "BACKGROUND_REFRESH"
  | "INLINE_LOADING"
  | "PROGRESS";

export type SafetyLevel = "NONE" | "CAUTION" | "AVOID" | "BLOCKED";

export interface Provenance {
  sourceType: string;
  observedAt?: string;
  provider?: string;
  confidence?: "LOW" | "MEDIUM" | "HIGH";
}

export interface ComposableState<TDomain> {
  domain: TDomain;
  truthStatus: TruthStatus;
  freshness?: Freshness;
  systemAvailability: SystemAvailability;
  permission: PermissionState;
  contentAvailability: ContentAvailability;
  interactionLifecycle: InteractionLifecycle;
  fetchLifecycle: FetchLifecycle;
  safetyLevel: SafetyLevel;
  provenance?: Provenance[];
  cached?: boolean;
}
