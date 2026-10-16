import { describe, expect, it } from "vitest";
import type { RoutingProvider } from "../src/routing/routing-contract";
import { handleRoutingRequest } from "../apps/api/src/routing-http-handler";

const primary: RoutingProvider = {
  id: "primary",
  async route(request) {
    return {
      status: "SUCCESS",
      provider: "primary",
      distanceMeters: 1000,
      durationSeconds: 500,
      route: { id: "route", source: "ROUTING_ENGINE", generatedAt: 1, coordinates: [request.origin, request.destination] },
    };
  },
};

describe("routing HTTP handler", () => {
  it("rejects malformed requests before providers run", async () => {
    expect(await handleRoutingRequest({ request: { origin: [999, 21], destination: [105, 21], mode: "DRIVING" } }, { primary, timeoutMs: 100 }))
      .toEqual({ status: 400, body: { error: "INVALID_REQUEST" } });
  });

  it("returns the provider-neutral gateway result", async () => {
    const response = await handleRoutingRequest(
      { request: { origin: [105.83, 21.02], destination: [105.84, 21.03], mode: "DRIVING" } },
      { primary, timeoutMs: 100 },
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ result: { status: "SUCCESS", provider: "primary" } });
  });
});
