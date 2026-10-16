import type { RoutingProvider, RoutingRequest, RoutingResult } from "@core/routing/routing-contract";
import type { RoutingGatewayResponse } from "@core/http/routing-gateway-contract";
import { isRenderableRoute } from "@core/map/map-contract";

const DEFAULT_TIMEOUT_MS = 8_000;

function isRoutingResult(value: unknown): value is RoutingResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<RoutingResult>;
  if (result.status === "FAILURE") {
    return typeof result.provider === "string" &&
      typeof result.retryable === "boolean" &&
      ["UNAVAILABLE", "TIMEOUT", "NO_ROUTE", "INVALID_RESPONSE"].includes(String(result.reason));
  }
  if (result.status === "SUCCESS") {
    return typeof result.provider === "string" &&
      typeof result.distanceMeters === "number" && Number.isFinite(result.distanceMeters) && result.distanceMeters >= 0 &&
      typeof result.durationSeconds === "number" && Number.isFinite(result.durationSeconds) && result.durationSeconds >= 0 &&
      !!result.route && isRenderableRoute(result.route);
  }
  return false;
}

export class HttpRoutingProvider implements RoutingProvider {
  readonly id = "backend-gateway";
  constructor(private readonly baseUrl: string, private readonly timeoutMs = DEFAULT_TIMEOUT_MS) {}

  async route(request: RoutingRequest): Promise<RoutingResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/v1/routing/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return { status: "FAILURE", reason: "UNAVAILABLE", retryable: response.status >= 500 || response.status === 429, provider: this.id };
      }
      const payload = await response.json() as Partial<RoutingGatewayResponse>;
      if (!isRoutingResult(payload.result)) {
        return { status: "FAILURE", reason: "INVALID_RESPONSE", retryable: false, provider: this.id };
      }
      return payload.result;
    } catch (error) {
      return {
        status: "FAILURE",
        reason: error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "UNAVAILABLE",
        retryable: true,
        provider: this.id,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
