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
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider.route(request, controller.signal)).catch((): RoutingResult =>
        ({ status: "FAILURE", reason: "UNAVAILABLE", retryable: true, provider: provider.id })),
      new Promise<RoutingResult>((resolve) => {
        timer = setTimeout(() => { controller.abort(); resolve(timeoutFailure(provider.id)); }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function routeThroughGateway(options: RoutingGatewayOptions, request: RoutingRequest): Promise<RoutingResult> {
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? Math.min(options.timeoutMs, 30_000) : 8_000;
  const primary: RoutingProvider = { id: options.primary.id, route: (input) => withTimeout(options.primary, input, timeoutMs) };
  const fallback = options.fallback
    ? { id: options.fallback.id, route: (input: RoutingRequest) => withTimeout(options.fallback!, input, timeoutMs) }
    : undefined;
  return routeWithFallback(primary, fallback, request);
}
