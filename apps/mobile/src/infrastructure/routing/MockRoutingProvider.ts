import type { RoutingProvider, RoutingRequest, RoutingResult } from "@core/routing/routing-contract";

export class MockRoutingProvider implements RoutingProvider {
  readonly id = "mock";
  constructor(private readonly result?: RoutingResult) {}

  async route(request: RoutingRequest): Promise<RoutingResult> {
    if (this.result) return this.result;
    return {
      status: "SUCCESS",
      provider: this.id,
      distanceMeters: 1800,
      durationSeconds: 720,
      route: {
        id: "mock-route",
        source: "MOCK",
        generatedAt: Date.now(),
        coordinates: [request.origin, request.destination],
      },
    };
  }
}
