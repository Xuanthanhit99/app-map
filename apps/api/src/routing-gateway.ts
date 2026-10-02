import type { RoutingProvider, RoutingRequest, RoutingResult } from "../../../src/routing/routing-contract";
import { routeWithFallback } from "../../../src/routing/routing-fallback";

export interface RoutingGatewayOptions {
  primary: RoutingProvider;
  fallback?: RoutingProvider;
  timeoutMs: number;
}

function timeoutFailure(provider: string): RoutingResult {
  return { status: "FAILURE", reason: "TIMEOUT", retryable: true, provider };
}

async function withTimeout(provider: RoutingProvider, request: RoutingRequest, timeoutMs: number): Promise<RoutingResult> {
  return Promise.race([
    provider.route(request).catch((): RoutingResult => ({ status: "FAILURE", reason: "UNAVAILABLE", retryable: true, provider: provider.id })),
    new Promise<RoutingResult>((resolve) => setTimeout(() => resolve(timeoutFailure(provider.id)), timeoutMs)),
  ]);
}

export async function routeThroughGateway(options: RoutingGatewayOptions, request: RoutingRequest): Promise<RoutingResult> {
  const primary: RoutingProvider = { id: options.primary.id, route: (input) => withTimeout(options.primary, input, options.timeoutMs) };
  const fallback = options.fallback
    ? { id: options.fallback.id, route: (input: RoutingRequest) => withTimeout(options.fallback!, input, options.timeoutMs) }
    : undefined;
  return routeWithFallback(primary, fallback, request);
}
