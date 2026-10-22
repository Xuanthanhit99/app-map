import type { RouteGeometry } from "../map/map-contract";
import type { NavigationManeuver } from "./navigation-guidance";

/** E-03 is a pure state reducer. It does not authorize or start device navigation. */
export interface ValidatedNavigationRoute {
  readonly geometry: RouteGeometry;
  readonly distanceMeters: number;
  readonly maneuvers: readonly NavigationManeuver[];
  /** Explicit E-02 validation evidence; the caller must validate the full candidate. */
  readonly dataValid: true;
  readonly guidanceReady: true;
}

export type NavigationSessionStatus =
  | "READY" | "ACTIVE" | "GPS_DEGRADED" | "OFF_ROUTE"
  | "REROUTING" | "PAUSED" | "ARRIVED" | "STOPPED" | "ERROR";

export interface PendingReroute {
  readonly requestId: string;
  readonly baseRevision: number;
  readonly returnStatus: "ACTIVE" | "GPS_DEGRADED" | "OFF_ROUTE";
}

export interface NavigationSession {
  readonly sessionId: string;
  readonly status: NavigationSessionStatus;
  readonly routeRevision: number;
  readonly route: ValidatedNavigationRoute;
  readonly pendingReroute?: PendingReroute | undefined;
  readonly startedAt?: number;
  readonly endedAt?: number;
}

export type NavigationSessionEvent =
  | { readonly type: "START"; readonly sessionId: string; readonly startGatePassed: boolean; readonly at: number }
  | { readonly type: "GPS_DEGRADED" | "GPS_RECOVERED" | "OFF_ROUTE" | "PAUSE" | "RESUME"; readonly sessionId: string }
  | { readonly type: "REQUEST_REROUTE"; readonly sessionId: string; readonly requestId: string; readonly baseRevision: number }
  | { readonly type: "REROUTE_SUCCEEDED"; readonly sessionId: string; readonly requestId: string; readonly baseRevision: number; readonly candidate: unknown }
  | { readonly type: "REROUTE_FAILED"; readonly sessionId: string; readonly requestId: string; readonly baseRevision: number }
  | { readonly type: "ARRIVE" | "STOP" | "FAIL"; readonly sessionId: string; readonly at: number };

const finiteNonnegative = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
const nonempty = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
const validCoordinate = (p: unknown): boolean =>
  Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && Number.isFinite(p[0]) &&
  typeof p[1] === "number" && Number.isFinite(p[1]) && p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;

/** Structural guard, NOT a substitute for E-02 provider validation. */
export function isValidatedNavigationRoute(value: unknown): value is ValidatedNavigationRoute {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ValidatedNavigationRoute>;
  return v.dataValid === true && v.guidanceReady === true &&
    finiteNonnegative(v.distanceMeters) &&
    !!v.geometry && nonempty(v.geometry.id) && Array.isArray(v.geometry.coordinates) &&
    v.geometry.coordinates.length >= 2 && v.geometry.coordinates.every(validCoordinate) &&
    Array.isArray(v.maneuvers) && v.maneuvers.length > 0 &&
    v.maneuvers.every(m => m && nonempty(m.maneuver) && nonempty(m.instructionType) &&
      finiteNonnegative(m.routeOffsetInMeters) && validCoordinate(m.point));
}

export function createNavigationSession(sessionId: string, route: unknown): NavigationSession {
  if (!nonempty(sessionId) || !isValidatedNavigationRoute(route)) throw new Error("INVALID_SESSION_INITIAL_ROUTE");
  return { sessionId, status: "READY", routeRevision: 1, route };
}

const terminal = (s: NavigationSessionStatus) => s === "ARRIVED" || s === "STOPPED" || s === "ERROR";
const activeLike = (s: NavigationSessionStatus) => s === "ACTIVE" || s === "GPS_DEGRADED" || s === "OFF_ROUTE";

/** Ignores invalid, cross-session and stale events without mutating state. */
export function reduceNavigationSession(state: NavigationSession, event: NavigationSessionEvent): NavigationSession {
  if (event.sessionId !== state.sessionId || terminal(state.status)) return state;
  switch (event.type) {
    case "START":
      return state.status === "READY" && event.startGatePassed === true && finiteNonnegative(event.at)
        ? { ...state, status: "ACTIVE", startedAt: event.at } : state;
    case "GPS_DEGRADED":
      if (state.status === "REROUTING" && state.pendingReroute)
        return { ...state, pendingReroute: { ...state.pendingReroute, returnStatus: "GPS_DEGRADED" } };
      return activeLike(state.status) ? { ...state, status: "GPS_DEGRADED" } : state;
    case "GPS_RECOVERED":
      if (state.status === "REROUTING" && state.pendingReroute && state.pendingReroute.returnStatus === "GPS_DEGRADED")
        return { ...state, pendingReroute: { ...state.pendingReroute, returnStatus: "ACTIVE" } };
      return state.status === "GPS_DEGRADED" ? { ...state, status: "ACTIVE" } : state;
    case "OFF_ROUTE":
      return activeLike(state.status) ? { ...state, status: "OFF_ROUTE" } : state;
    case "PAUSE":
      return activeLike(state.status) || state.status === "REROUTING"
        ? { ...state, status: "PAUSED", pendingReroute: undefined } : state;
    case "RESUME":
      // Resume never certifies GPS or authorizes Start; external gates are still required.
      return state;
    case "REQUEST_REROUTE":
      if (!activeLike(state.status) || event.baseRevision !== state.routeRevision || !nonempty(event.requestId)) return state;
      return { ...state, status: "REROUTING", pendingReroute: {
        requestId: event.requestId, baseRevision: state.routeRevision, returnStatus: state.status,
      } };
    case "REROUTE_SUCCEEDED": {
      const pending = state.pendingReroute;
      if (state.status !== "REROUTING" || !pending || pending.requestId !== event.requestId ||
        pending.baseRevision !== event.baseRevision || state.routeRevision !== event.baseRevision ||
        !isValidatedNavigationRoute(event.candidate)) return state;
      // One atomic replacement; revision increments exactly once.
      return { ...state, route: event.candidate, routeRevision: state.routeRevision + 1,
        status: pending.returnStatus, pendingReroute: undefined };
    }
    case "REROUTE_FAILED": {
      const pending = state.pendingReroute;
      if (state.status !== "REROUTING" || !pending || pending.requestId !== event.requestId ||
        pending.baseRevision !== event.baseRevision || state.routeRevision !== event.baseRevision) return state;
      return { ...state, status: pending.returnStatus, pendingReroute: undefined };
    }
    case "ARRIVE":
    case "STOP":
    case "FAIL":
      if (!finiteNonnegative(event.at)) return state;
      return { ...state, status: event.type === "ARRIVE" ? "ARRIVED" : event.type === "STOP" ? "STOPPED" : "ERROR",
        endedAt: event.at, pendingReroute: undefined };
  }
}
