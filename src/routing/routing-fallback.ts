import { isRenderableRoute } from "../map/map-contract";
import type { RoutingFailure, RoutingProvider, RoutingRequest, RoutingResult, RoutingSuccess } from "./routing-contract";

function validSuccess(result: RoutingResult): result is RoutingSuccess {
  return result.status === "SUCCESS" && isRenderableRoute(result.route) && result.distanceMeters >= 0 && result.durationSeconds >= 0;
}

function normalizeResult(result: RoutingResult, providerId: string): RoutingSuccess | RoutingFailure {
  if (result.status === "FAILURE") return result;
  if (isRenderableRoute(result.route) && result.distanceMeters >= 0 && result.durationSeconds >= 0) return result;
  return { status: "FAILURE", reason: "INVALID_RESPONSE", retryable: false, provider: providerId };
}

export async function routeWithFallback(primary: RoutingProvider, fallback: RoutingProvider | undefined, request: RoutingRequest): Promise<RoutingResult> {
  const first = normalizeResult(await primary.route(request), primary.id);
  if (validSuccess(first)) return first;
  if (!fallback || !first.retryable) return first;
  return normalizeResult(await fallback.route(request), fallback.id);
}
