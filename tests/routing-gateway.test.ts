import { describe, expect, it } from "vitest";
import type { RoutingProvider, RoutingRequest } from "../src/routing/routing-contract";
import { routeThroughGateway } from "../apps/api/src/routing-gateway";

const request: RoutingRequest = { origin: [105.83, 21.02], destination: [105.84, 21.03], mode: "DRIVING" };

describe("backend routing gateway", () => {
  it("normalizes provider rejection to retryable unavailable and falls back", async () => {
    const primary: RoutingProvider = { id: "primary", async route() { throw new Error("network"); } };
    const fallback: RoutingProvider = { id: "fallback", async route(input) { return { status: "SUCCESS", provider: "fallback", distanceMeters: 1000, durationSeconds: 500, route: { id: "fallback-route", source: "MOCK", generatedAt: 1, coordinates: [input.origin, input.destination] } }; } };
    expect(await routeThroughGateway({ primary, fallback, timeoutMs: 50 }, request)).toMatchObject({ status: "SUCCESS", provider: "fallback" });
  });

  it("normalizes provider timeout and permits fallback", async () => {
    const primary: RoutingProvider = { id: "slow", route: () => new Promise(() => {}) };
    const fallback: RoutingProvider = { id: "fallback", async route(input) { return { status: "SUCCESS", provider: "fallback", distanceMeters: 1000, durationSeconds: 500, route: { id: "fallback-route", source: "MOCK", generatedAt: 1, coordinates: [input.origin, input.destination] } }; } };
    expect(await routeThroughGateway({ primary, fallback, timeoutMs: 1 }, request)).toMatchObject({ status: "SUCCESS", provider: "fallback" });
  });
});
