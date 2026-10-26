import type { Coordinate, RouteGeometry } from "../map/map-contract";

export type TravelMode = "DRIVING" | "WALKING" | "CYCLING";

export interface RoutingRequest {
  origin: Coordinate;
  destination: Coordinate;
  mode: TravelMode;
}

/** One provider-issued guidance step. Text is the provider's own (never synthesised by REALITY). */
export interface RouteInstruction {
  /** Distance along the route, from the start, where the maneuver happens. */
  routeOffsetMeters: number;
  maneuver: string;
  text: string;
  street?: string;
}

export interface RoutingSuccess {
  status: "SUCCESS";
  route: RouteGeometry;
  distanceMeters: number;
  durationSeconds: number;
  provider: string;
  /** Present only when the provider returned guidance; absent means route-only navigation. */
  instructions?: RouteInstruction[];
}

export type RoutingFailureReason = "UNAVAILABLE" | "TIMEOUT" | "NO_ROUTE" | "INVALID_RESPONSE";

export interface RoutingFailure {
  status: "FAILURE";
  reason: RoutingFailureReason;
  retryable: boolean;
  provider: string;
}

export type RoutingResult = RoutingSuccess | RoutingFailure;

export interface RoutingProvider {
  readonly id: string;
  route(request: RoutingRequest, signal?: AbortSignal): Promise<RoutingResult>;
}
