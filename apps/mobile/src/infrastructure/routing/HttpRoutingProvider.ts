import type { RoutingProvider, RoutingRequest, RoutingResult } from "@core/routing/routing-contract";
import type { RoutingGatewayResponse } from "@core/http/routing-gateway-contract";

export class HttpRoutingProvider implements RoutingProvider {
  readonly id = "backend-gateway";
  constructor(private readonly baseUrl: string) {}

  async route(request: RoutingRequest): Promise<RoutingResult> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/routing/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request }),
      });
      if (!response.ok) return { status: "FAILURE", reason: "UNAVAILABLE", retryable: response.status >= 500, provider: this.id };
      const payload = await response.json() as RoutingGatewayResponse;
      return payload.result;
    } catch {
      return { status: "FAILURE", reason: "UNAVAILABLE", retryable: true, provider: this.id };
    }
  }
}
