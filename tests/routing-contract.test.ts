import { describe, expect, it } from "vitest";
import type { RoutingProvider, RoutingRequest, RoutingResult } from "../src/routing/routing-contract";
import { routeWithFallback } from "../src/routing/routing-fallback";

const request: RoutingRequest = { origin: [105.83, 21.02], destination: [105.84, 21.03], mode: "DRIVING" };

function provider(id: string, result: RoutingResult): RoutingProvider {
  return { id, async route() { return result; } };
}

describe("routing provider boundary", () => {
  it("returns a valid provider-neutral route", async () => {
    const result = await routeWithFallback(provider("primary", {
      status: "SUCCESS", provider: "primary", distanceMeters: 1200, durationSeconds: 600,
      route: { id: "r1", source: "MOCK", generatedAt: 1, coordinates: [request.origin, request.destination] },
    }), undefined, request);
    expect(result.status).toBe("SUCCESS");
  });

  it("rejects invalid provider geometry at the boundary", async () => {
    const result = await routeWithFallback(provider("primary", {
      status: "SUCCESS", provider: "primary", distanceMeters: 10, durationSeconds: 10,
      route: { id: "bad", source: "MOCK", generatedAt: 1, coordinates: [[999, 999], request.destination] },
    }), undefined, request);
    expect(result).toMatchObject({ status: "FAILURE", reason: "INVALID_RESPONSE", retryable: false });
  });

  it("falls back when the primary provider is retryably unavailable", async () => {
    const result = await routeWithFallback(
      provider("primary", { status: "FAILURE", reason: "UNAVAILABLE", retryable: true, provider: "primary" }),
      provider("fallback", { status: "SUCCESS", provider: "fallback", distanceMeters: 1400, durationSeconds: 700, route: { id: "r2", source: "MOCK", generatedAt: 2, coordinates: [request.origin, request.destination] } }),
      request,
    );
    expect(result).toMatchObject({ status: "SUCCESS", provider: "fallback" });
  });

  it("does not hide a non-retryable primary failure behind fallback", async () => {
    const result = await routeWithFallback(
      provider("primary", { status: "FAILURE", reason: "NO_ROUTE", retryable: false, provider: "primary" }),
      provider("fallback", { status: "FAILURE", reason: "UNAVAILABLE", retryable: true, provider: "fallback" }),
      request,
    );
    expect(result).toMatchObject({ status: "FAILURE", reason: "NO_ROUTE", provider: "primary" });
  });
});
