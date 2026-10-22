import type { RoutingGatewayRequest, RoutingGatewayResponse } from "../../../src/http/routing-gateway-contract";
import type { RoutingProvider, RoutingRequest } from "../../../src/routing/routing-contract";
import { routeThroughGateway } from "./routing-gateway";

export interface RoutingHttpDependencies {
  primary: RoutingProvider;
  fallback?: RoutingProvider;
  timeoutMs: number;
}

function isCoordinate(value: unknown): value is readonly [number, number] {
  return Array.isArray(value) && value.length === 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90;
}

function isRoutingRequest(value: unknown): value is RoutingRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<RoutingRequest>;
  return isCoordinate(request.origin) && isCoordinate(request.destination) &&
    ["DRIVING", "WALKING", "CYCLING"].includes(String(request.mode));
}

export async function handleRoutingRequest(
  body: unknown,
  dependencies: RoutingHttpDependencies,
): Promise<{ status: number; body: RoutingGatewayResponse | { error: "INVALID_REQUEST" } }> {
  const envelope = body as Partial<RoutingGatewayRequest> | null;
  if (!envelope || !isRoutingRequest(envelope.request)) {
    return { status: 400, body: { error: "INVALID_REQUEST" } };
  }

  const result = await routeThroughGateway(dependencies, envelope.request);
  return { status: 200, body: { result } };
}
