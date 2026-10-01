import { isRenderableRoute } from "../map/map-contract";
import type { RoutingProvider, RoutingRequest, RoutingResult, RoutingSuccess } from "./routing-contract";

function validSuccess(result: RoutingResult): result is RoutingSuccess {
  return result.status === "SUCCESS" && isRenderableRoute(result.route) && result.distanceMeters >= 0 && result.durationSeconds >= 0;
}

export async function routeWithFallback(primary: RoutingProvider, fallback: RoutingProvider | undefined, request: RoutingRequest): Promise<RoutingResult> {
  const first = await primary.route(request);
  if (validSuccess(first)) return first;

  const normalized: RoutingResult = first.status === "SUCCESS"
    ? { status: "FAILURE", reason: "INVALID_RESPONSE", retryable: false, provider: primary.id }
    : first;

  if (!fallback || (normalized.status === "FAILURE" && !normalized.retryable)) return normalized;
  const second = await fallback.route(request);
  if (validSuccess(second)) return second;
  return second.status === "SUCCESS"
    ? { status: "FAILURE", reason: "INVALID_RESPONSE", retryable: false, provider: fallback.id }
    : second;
}
