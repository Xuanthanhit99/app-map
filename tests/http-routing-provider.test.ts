import { describe, expect, it, vi } from "vitest";
import { HttpRoutingProvider } from "../apps/mobile/src/infrastructure/routing/HttpRoutingProvider";

const request = { origin: [105.83, 21.02] as const, destination: [105.84, 21.03] as const, mode: "DRIVING" as const };

describe("mobile HTTP routing provider", () => {
  it("accepts a valid provider-neutral success response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: {
      status: "SUCCESS", provider: "tomtom", distanceMeters: 1000, durationSeconds: 500,
      route: { id: "real", source: "ROUTING_ENGINE", generatedAt: 1, coordinates: [request.origin, request.destination] },
    }}), { status: 200 })));
    expect(await new HttpRoutingProvider("http://api").route(request)).toMatchObject({ status: "SUCCESS", provider: "tomtom" });
    vi.unstubAllGlobals();
  });

  it("fails closed on an invalid success payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: {
      status: "SUCCESS", provider: "tomtom", distanceMeters: 1000, durationSeconds: 500,
      route: { id: "bad", source: "ROUTING_ENGINE", generatedAt: 1, coordinates: [] },
    }}), { status: 200 })));
    expect(await new HttpRoutingProvider("http://api").route(request)).toMatchObject({ status: "FAILURE", reason: "INVALID_RESPONSE" });
    vi.unstubAllGlobals();
  });

  it("returns retryable UNAVAILABLE when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Network request failed"); }));
    expect(await new HttpRoutingProvider("http://api").route(request)).toMatchObject({ status: "FAILURE", reason: "UNAVAILABLE", retryable: true });
    vi.unstubAllGlobals();
  });

  it("returns TIMEOUT when the backend exceeds the client deadline", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    expect(await new HttpRoutingProvider("http://api", 1).route(request)).toMatchObject({ status: "FAILURE", reason: "TIMEOUT", retryable: true });
    vi.unstubAllGlobals();
  });
});
