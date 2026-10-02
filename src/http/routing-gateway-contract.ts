import type { RoutingRequest, RoutingResult } from "../routing/routing-contract";

export interface RoutingGatewayRequest {
  request: RoutingRequest;
}

export interface RoutingGatewayResponse {
  result: RoutingResult;
}

export const ROUTING_GATEWAY_PATH = "/v1/routing/route";
