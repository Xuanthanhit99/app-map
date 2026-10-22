import { z } from "zod";

/** Response contracts. Used to generate OpenAPI and validated against live responses in contract tests. */
export const ErrorEnvelope = z.object({
  error: z.string().regex(/^[A-Z0-9_]+$/),
  details: z.array(z.object({ path: z.string(), code: z.string(), message: z.string().optional() })).optional(),
  requestId: z.string().uuid(),
});

export const PublicUser = z.object({ id: z.string().uuid(), email: z.string(), displayName: z.string(), role: z.enum(["user", "moderator", "admin"]), locale: z.string(), emailVerified: z.boolean(), createdAt: z.string() });
export const TokenPair = z.object({ accessToken: z.string().startsWith("rat_"), refreshToken: z.string().startsWith("rrt_"), accessExpiresAt: z.string(), refreshExpiresAt: z.string(), tokenType: z.literal("Bearer") });
export const AuthResponse = z.object({ user: PublicUser, tokens: TokenPair });

const Coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export const SourceRef = z.object({ id: z.string(), name: z.string(), attribution: z.string(), license: z.string() });
export const Place = z.object({
  id: z.string().uuid(), slug: z.string(), name: z.string(), category: z.string(), categoryLabel: z.string(), address: z.string().nullable(),
  coordinate: Coordinate, areaId: z.string().nullable(), openingHours: z.object({ raw: z.string(), note: z.string() }).nullable(),
  website: z.string().nullable(), phone: z.string().nullable(), wheelchair: z.string().nullable(), source: SourceRef,
  sourceUpdatedAt: z.string().nullable(), updatedAt: z.string(), distanceMeters: z.number().optional(),
});
export const RealityState = z.object({
  subjectKey: z.string(), domain: z.string(), truth: z.enum(["KNOWN", "UNKNOWN", "CONFLICT"]), value: z.string().nullable(),
  label: z.string().nullable(), freshness: z.enum(["FRESH", "AGING", "STALE"]).nullable(), safety: z.enum(["NONE", "CAUTION", "AVOID", "BLOCKED"]),
  severity: z.enum(["INFO", "MINOR", "SIGNIFICANT", "SAFETY_CRITICAL"]), confidence: z.number().min(0).max(1),
  nature: z.enum(["LIVE_OBSERVATION", "FORECAST", "MODEL_ESTIMATE", "STATIC_REFERENCE", "COMMUNITY_REPORT"]).nullable(),
  observedAt: z.string().nullable(), validUntil: z.string().nullable(), sources: z.array(SourceRef), sourceIds: z.array(z.string()),
  supportingEvidenceIds: z.array(z.string()), reason: z.string(), policyVersion: z.string(),
  signals: z.array(z.object({ type: z.literal("REPORTED_UNVERIFIED"), value: z.string(), contributors: z.number().int(), latestAt: z.string() })),
  candidates: z.array(z.object({ value: z.string(), weight: z.number(), contributors: z.number().int(), authoritative: z.boolean() })),
  coordinate: Coordinate.optional(),
});
export const StatesResponse = z.object({ status: z.enum(["ready", "empty"]), items: z.array(RealityState), reason: z.string().optional(), evaluatedAt: z.string() });
export const PlaceDetail = z.object({
  place: Place, states: z.array(RealityState), saved: z.boolean(),
  stories: z.array(z.object({ id: z.string(), slug: z.string(), title: z.string(), summary: z.string(), publishedAt: z.string().nullable() })),
  recentReports: z.array(z.object({ id: z.string(), domain: z.string(), value: z.string(), status: z.string(), observedAt: z.string() })),
  evaluatedAt: z.string(),
});
export const PlaceList = z.object({ items: z.array(Place), nextCursor: z.string().nullable() });
export const PublicReport = z.object({
  id: z.string().uuid(), domain: z.string(), value: z.string(), valueLabel: z.string(), status: z.string(), placeId: z.string().nullable(),
  cell: z.string().length(7), approximateCoordinate: Coordinate, confirmCount: z.number().int(), denyCount: z.number().int(),
  observedAt: z.string(), expiresAt: z.string(),
  note: z.string().nullable().optional(), heldForReview: z.boolean().optional(), createdAt: z.string().optional(),
});
export const SubmitReportResponse = z.object({ report: PublicReport, subjectKey: z.string(), stateChanged: z.boolean() });
const Factor = z.object({ factor: z.string(), effect: z.number(), text: z.string(), basis: z.enum(["EVIDENCE", "ASSUMPTION", "USER_INPUT", "UNKNOWN"]),
  evidence: z.object({ sourceIds: z.array(z.string()), observedAt: z.string().nullable(), truth: z.string(), freshness: z.string().nullable(), nature: z.string().nullable() }).optional() });
export const DecideResponse = z.union([
  z.object({ status: z.literal("needs_clarification"), intent: z.any(), suggestions: z.array(z.object({ id: z.string(), label: z.string() })), message: z.string(), policyVersion: z.string(), evaluatedAt: z.string() }),
  z.object({
    status: z.enum(["ready", "empty"]), reason: z.string().optional(), intent: z.any(), mode: z.string().optional(), radiusMeters: z.number().optional(), personalized: z.boolean().optional(),
    options: z.array(z.object({ rank: z.number().int(), place: Place, score: z.number(), factors: z.array(Factor), risks: z.array(z.string()), unknowns: z.array(z.string()),
      estimate: z.object({ travelMinutes: z.number(), method: z.literal("STRAIGHT_LINE_X1_35_AVG_SPEED"), label: z.string(), visitMinutesAssumed: z.number() }).nullable(), states: z.array(RealityState) })),
    alternatives: z.array(z.object({ place: Place, score: z.number() })).optional(),
    excluded: z.array(z.object({ place: Place, reason: z.string().nullable() })), coverage: z.array(z.string()), policyVersion: z.string(), evaluatedAt: z.string(),
  }),
]);
export const Journey = z.object({
  id: z.string().uuid(), status: z.enum(["PLANNED", "ACTIVE", "PAUSED", "ARRIVED", "CANCELLED", "STOPPED"]), mode: z.string(),
  origin: Coordinate, destination: Coordinate, destinationPlaceId: z.string().nullable(), destinationLabel: z.string().nullable(),
  route: z.object({ provider: z.string().nullable(), revision: z.number().int(), distanceMeters: z.number().nullable(), durationSeconds: z.number().nullable(), durationLabel: z.string(), coordinates: z.array(Coordinate) }).nullable(),
  routeStatus: z.enum(["AVAILABLE", "UNAVAILABLE"]), canStart: z.boolean(), startedAt: z.string().nullable(), endedAt: z.string().nullable(), createdAt: z.string(),
});
export const PulseResponse = z.object({ status: z.enum(["ready", "empty"]), reason: z.string().optional(), note: z.string(), evaluatedAt: z.string(),
  items: z.array(z.object({ id: z.string(), subjectKey: z.string(), domain: z.string(), headline: z.string().nullable(), truth: z.string(), freshness: z.string().nullable(),
    confidence: z.number(), severity: z.string(), sources: z.array(SourceRef), coordinate: Coordinate, followUp: z.string() }).passthrough()) });
export const NotificationList = z.object({ unreadCount: z.number().int(), items: z.array(z.object({ id: z.string(), kind: z.string(), severity: z.string(), title: z.string(), body: z.string(), data: z.any(), readAt: z.any(), createdAt: z.any() })) });
