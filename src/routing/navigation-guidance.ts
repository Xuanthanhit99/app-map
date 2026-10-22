import type { Coordinate, RouteGeometry } from "../map/map-contract";

/** This is an app contract, not the complete TomTom response schema. */
export interface NavigationManeuver {
  sequence: number;
  maneuver: string;
  instructionType: string;
  routeOffsetInMeters: number;
  point: Coordinate;
  pointIndex?: number;
  message?: string;
  travelTimeInSeconds?: number;
  street?: string;
  countryCode?: string;
  possibleCombineWithNext?: boolean;
  drivingSide?: string;
}

export type GuidanceIssueCode =
  | "EMPTY_GUIDANCE" | "INVALID_GEOMETRY" | "INVALID_DISTANCE"
  | "INVALID_INSTRUCTION" | "INVALID_COORDINATE" | "INVALID_POINT_INDEX"
  | "POINT_MISMATCH" | "OFFSET_ORDER" | "OFFSET_EXCEEDS_ROUTE"
  | "UNKNOWN_MANEUVER" | "MISSING_MESSAGE" | "MISSING_POINT_INDEX";

export interface GuidanceIssue {
  code: GuidanceIssueCode;
  index?: number;
}

export interface GuidanceValidation {
  dataValid: boolean;
  guidanceReady: boolean;
  issues: readonly GuidanceIssue[];
  maneuvers: readonly NavigationManeuver[];
}

export interface GuidancePolicy {
  supportedManeuvers: ReadonlySet<string>;
  /** Must be set from product/device evidence, not assumed. */
  coordinateToleranceDegrees: number;
  offsetToleranceMeters: number;
  requireMessageForGuidance: boolean;
  requirePointIndexForGuidance: boolean;
}

const DEFAULT_POLICY: GuidancePolicy = {
  // Conservative allowlist from the single E-01 live fixture, not all TomTom codes.
  supportedManeuvers: new Set(["DEPART", "TURN_RIGHT", "BEAR_LEFT", "ROUNDABOUT_RIGHT", "TURN_LEFT", "ARRIVE"]),
  coordinateToleranceDegrees: 0.000001,
  offsetToleranceMeters: 0,
  requireMessageForGuidance: true,
  requirePointIndexForGuidance: true,
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonNegative = (value: unknown): value is number => finite(value) && value >= 0;
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const coordinate = (value: unknown): value is Coordinate =>
  Array.isArray(value) && value.length === 2 && finite(value[0]) && finite(value[1]) &&
  value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90;

/** Converts provider latitude/longitude to app [longitude, latitude]. */
function parsePoint(value: unknown): Coordinate | null {
  if (!object(value) || !finite(value.longitude) || !finite(value.latitude)) return null;
  const pair: Coordinate = [value.longitude, value.latitude];
  return coordinate(pair) ? pair : null;
}

/** Read-only parse: never fabricates missing maneuver text or route points. */
export function validateTomTomGuidance(
  rawInstructions: unknown,
  route: RouteGeometry,
  distanceMeters: number,
  overrides: Partial<GuidancePolicy> = {},
): GuidanceValidation {
  const policy: GuidancePolicy = { ...DEFAULT_POLICY, ...overrides };
  const issues: GuidanceIssue[] = [];
  const maneuvers: NavigationManeuver[] = [];
  const add = (code: GuidanceIssueCode, index?: number) => issues.push(index === undefined ? { code } : { code, index });
  if (!Array.isArray(route.coordinates) || route.coordinates.length < 2 || !route.coordinates.every(coordinate)) add("INVALID_GEOMETRY");
  if (!nonNegative(distanceMeters)) add("INVALID_DISTANCE");
  if (!Array.isArray(rawInstructions) || rawInstructions.length === 0) add("EMPTY_GUIDANCE");
  if (!nonNegative(policy.coordinateToleranceDegrees) || !nonNegative(policy.offsetToleranceMeters)) add("INVALID_INSTRUCTION");
  if (!Array.isArray(rawInstructions) || rawInstructions.length === 0) return { dataValid: false, guidanceReady: false, issues, maneuvers };

  let previousOffset = -1;
  rawInstructions.forEach((raw: unknown, index: number) => {
    if (!object(raw) || !nonempty(raw.maneuver) || !nonempty(raw.instructionType) || !nonNegative(raw.routeOffsetInMeters)) {
      add("INVALID_INSTRUCTION", index);
      return;
    }
    const point = parsePoint(raw.point);
    if (!point) { add("INVALID_COORDINATE", index); return; }
    const offset = raw.routeOffsetInMeters;
    if (offset < previousOffset) add("OFFSET_ORDER", index);
    previousOffset = offset;
    if (nonNegative(distanceMeters) && offset > distanceMeters + policy.offsetToleranceMeters) add("OFFSET_EXCEEDS_ROUTE", index);

    const idx = raw.pointIndex;
    if (idx !== undefined) {
      if (!Number.isInteger(idx) || !finite(idx) || idx < 0 || idx >= route.coordinates.length) {
        add("INVALID_POINT_INDEX", index);
      } else {
        const geometryPoint = route.coordinates[idx];
        if (!geometryPoint || Math.abs(geometryPoint[0] - point[0]) > policy.coordinateToleranceDegrees ||
          Math.abs(geometryPoint[1] - point[1]) > policy.coordinateToleranceDegrees) add("POINT_MISMATCH", index);
      }
    } else if (policy.requirePointIndexForGuidance) add("MISSING_POINT_INDEX", index);
    if (!policy.supportedManeuvers.has(raw.maneuver)) add("UNKNOWN_MANEUVER", index);
    if (!nonempty(raw.message) && policy.requireMessageForGuidance) add("MISSING_MESSAGE", index);

    const parsed: NavigationManeuver = {
      sequence: index,
      maneuver: raw.maneuver,
      instructionType: raw.instructionType,
      routeOffsetInMeters: offset,
      point,
    };
    if (Number.isInteger(idx) && finite(idx) && idx >= 0) parsed.pointIndex = idx;
    if (typeof raw.message === "string") parsed.message = raw.message;
    if (nonNegative(raw.travelTimeInSeconds)) parsed.travelTimeInSeconds = raw.travelTimeInSeconds;
    if (typeof raw.street === "string") parsed.street = raw.street;
    if (typeof raw.countryCode === "string") parsed.countryCode = raw.countryCode;
    if (typeof raw.possibleCombineWithNext === "boolean") parsed.possibleCombineWithNext = raw.possibleCombineWithNext;
    if (typeof raw.drivingSide === "string") parsed.drivingSide = raw.drivingSide;
    maneuvers.push(parsed);
  });

  const guidanceOnly: ReadonlySet<GuidanceIssueCode> = new Set(["UNKNOWN_MANEUVER", "MISSING_MESSAGE", "MISSING_POINT_INDEX"]);
  const dataValid = !issues.some(issue => !guidanceOnly.has(issue.code));
  return { dataValid, guidanceReady: dataValid && issues.length === 0 && maneuvers.length === rawInstructions.length, issues, maneuvers };
}
