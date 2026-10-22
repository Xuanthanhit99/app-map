export type Coordinate = [number, number];
export type SourceRef = { id: string; name: string; attribution: string; license: string };
export type Truth = "KNOWN" | "UNKNOWN" | "CONFLICT";
export type Freshness = "FRESH" | "AGING" | "STALE";
export type Safety = "NONE" | "CAUTION" | "AVOID" | "BLOCKED";
export type Severity = "INFO" | "MINOR" | "SIGNIFICANT" | "SAFETY_CRITICAL";
export type Nature = "LIVE_OBSERVATION" | "FORECAST" | "MODEL_ESTIMATE" | "STATIC_REFERENCE" | "COMMUNITY_REPORT";

export type Place = {
  id: string; slug: string; name: string; category: string; categoryLabel: string; address: string | null; coordinate: Coordinate;
  areaId: string | null; openingHours: { raw: string; note: string } | null; website: string | null; phone: string | null;
  wheelchair: string | null; source: SourceRef; sourceUpdatedAt: string | null; updatedAt: string; distanceMeters?: number;
};
export type RealityState = {
  subjectKey: string; domain: string; truth: Truth; value: string | null; label: string | null; freshness: Freshness | null;
  safety: Safety; severity: Severity; confidence: number; nature: Nature | null; observedAt: string | null; validUntil: string | null;
  sources: SourceRef[]; signals: { type: "REPORTED_UNVERIFIED"; value: string; contributors: number; latestAt: string }[];
  reason: string; coordinate?: Coordinate;
};
export type PlaceDetail = {
  place: Place; states: RealityState[]; saved: boolean; evaluatedAt: string;
  stories: { id: string; slug: string; title: string; summary: string; publishedAt: string | null }[];
  recentReports: { id: string; domain: string; value: string; status: string; observedAt: string }[];
};
export type PublicReport = {
  id: string; domain: string; value: string; valueLabel: string; status: string; placeId: string | null; cell: string;
  approximateCoordinate: Coordinate; confirmCount: number; denyCount: number; observedAt: string; expiresAt: string;
  note?: string | null; heldForReview?: boolean; createdAt?: string;
};
export type PulseItem = {
  id: string; subjectKey: string; placeId: string | null; domain: string; headline: string | null; truth: Truth; value: string | null;
  freshness: Freshness | null; confidence: number; nature: Nature | null; severity: Severity; safety: Safety; sources: SourceRef[];
  observedAt: string | null; coordinate: Coordinate; followUp: "AVOID_OR_REROUTE" | "HELP_VERIFY" | "VIEW_PLACE" | "VIEW_ON_MAP";
  change: { from: { truth: string; value: string | null } | null; to: { truth: string; value: string | null }; at: string };
};
export type Factor = { factor: string; effect: number; text: string; basis: "EVIDENCE" | "ASSUMPTION" | "USER_INPUT" | "UNKNOWN";
  evidence?: { sourceIds: string[]; observedAt: string | null; truth: string; freshness: string | null; nature: string | null } };
export type DecideOption = { rank: number; place: Place; score: number; factors: Factor[]; risks: string[]; unknowns: string[];
  estimate: { travelMinutes: number; method: string; label: string; visitMinutesAssumed: number } | null; states: RealityState[] };
export type DecideResponse =
  | { status: "needs_clarification"; suggestions: { id: string; label: string }[]; message: string }
  | { status: "ready" | "empty"; reason?: string; options: DecideOption[]; alternatives?: { place: Place; score: number }[];
      excluded: { place: Place; reason: string | null }[]; coverage: string[]; mode?: string; radiusMeters?: number; personalized?: boolean; evaluatedAt: string };
export type Journey = {
  id: string; status: "PLANNED" | "ACTIVE" | "PAUSED" | "ARRIVED" | "CANCELLED" | "STOPPED"; mode: string; origin: Coordinate; destination: Coordinate;
  destinationPlaceId: string | null; destinationLabel: string | null;
  route: { provider: string | null; revision: number; distanceMeters: number | null; durationSeconds: number | null; durationLabel: string; coordinates: Coordinate[] } | null;
  routeStatus: "AVAILABLE" | "UNAVAILABLE"; canStart: boolean; startedAt: string | null; endedAt: string | null; createdAt: string;
  guidance: { provider: string | null; revision: number; instructions: { routeOffsetMeters: number; maneuver: string; text: string; street?: string }[] } | null;
};
export type ImpactItem = { kind: "STATE" | "INCIDENT"; severity: Severity; label: string; truth: Truth; value?: string | null; freshness?: Freshness | null;
  confidence?: number; sources?: SourceRef[]; distanceFromRouteMeters?: number; coordinate?: Coordinate; subjectKey?: string };
export type Impact = { status: "UNAVAILABLE"; items: [] } | { status: "EVALUATED"; worstSeverity: Severity | null; recommendation: string; note: string; items: ImpactItem[]; evaluatedAt: string };
export type Notification = { id: string; kind: string; severity: Severity; title: string; body: string; data: Record<string, unknown>; readAt: string | null; createdAt: string };
export type Story = { id: string; slug: string; title: string; summary: string; status: string; place: { id: string; slug: string; name: string } | null;
  author: { displayName: string } | null; publishedAt: string | null; updatedAt: string; body?: string; sources?: { title: string; url: string }[] };
