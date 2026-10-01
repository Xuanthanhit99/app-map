import type { Coordinate, RouteGeometry } from "../map/map-contract";

export type TravelMode = "DRIVING" | "WALKING" | "CYCLING";

export interface RoutingRequest {
  origin: Coordinate;
  destination: Coordinate;
  mode: TravelMode;
}

export interface RoutingSuccess {
  status: "SUCCESS";
  route: RouteGeometry;
  distanceMeters: number;
  durationSeconds: number;
  provider: string;
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
  route(request: RoutingRequest): Promise<RoutingResult>;
}
