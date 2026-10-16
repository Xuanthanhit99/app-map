import { describe, expect, it, vi } from "vitest";
import { checkRateLimit, applyApiGuards } from "../apps/api/src/api-guard";
import { routeThroughGateway } from "../apps/api/src/routing-gateway";
import { TomTomRoutingProvider } from "../apps/api/src/tomtom-routing-provider";
import type { RoutingRequest } from "../src/routing/routing-contract";

const input: RoutingRequest = { origin: [105.83, 21.02], destination: [105.84, 21.03], mode: "DRIVING" };
describe("P1 production hardening", () => {
  it("enforces rate limits per socket peer", () => {
    expect(checkRateLimit("test-p1-key", 1000, 2)).toBe(true);
    expect(checkRateLimit("test-p1-key", 1000, 2)).toBe(true);
    expect(checkRateLimit("test-p1-key", 1000, 2)).toBe(false);
    expect(checkRateLimit("test-p1-key", 62000, 2)).toBe(true);
  });
  it("rejects forbidden browser origins without trusting spoofed headers", () => {
    const state = { status: 0, body: "" };
    const response = { setHeader: vi.fn(), writeHead: vi.fn((code: number) => { state.status = code; }), end: vi.fn((value: string) => { state.body = value; }) };
    const request = { method: "GET", headers: { origin: "https://evil.example", "x-forwarded-for": "1.2.3.4" }, socket: { remoteAddress: "127.0.0.1" } };
    expect(applyApiGuards(request as never, response as never, ["https://trusted.example"])).toBe(false);
    expect(state.status).toBe(403);
    expect(state.body).not.toContain("1.2.3.4");
  });
  it("aborts a timed-out provider and permits fallback", async () => {
    let aborted = false;
    const primary = { id: "primary", route: async (_request: RoutingRequest, signal?: AbortSignal) => new Promise<never>(() => { signal?.addEventListener("abort", () => { aborted = true; }); }) };
    const fallback = { id: "fallback", route: async () => ({ status: "FAILURE" as const, reason: "NO_ROUTE" as const, retryable: false, provider: "fallback" }) };
    expect(await routeThroughGateway({ primary, fallback, timeoutMs: 5 }, input)).toMatchObject({ status: "FAILURE", provider: "fallback" });
    expect(aborted).toBe(true);
  });
  it("rejects NaN and out-of-range provider coordinates", async () => {
    const transport: typeof fetch = async () => new Response(JSON.stringify({ routes: [{ summary: { lengthInMeters: 200, travelTimeInSeconds: 100 }, legs: [{ points: [{ latitude: 200, longitude: 105 }, { latitude: 21, longitude: 105 }] }] }] }), { status: 200 });
    expect(await new TomTomRoutingProvider("secret", transport).route(input)).toMatchObject({ status: "FAILURE", reason: "INVALID_RESPONSE" });
  });
  it("rejects non-finite and zero route metrics", async () => {
    const transport: typeof fetch = async () => new Response(JSON.stringify({ routes: [{ summary: { lengthInMeters: 0, travelTimeInSeconds: 100 }, legs: [{ points: [{ latitude: 21, longitude: 105 }, { latitude: 22, longitude: 106 }] }] }] }), { status: 200 });
    expect(await new TomTomRoutingProvider("secret", transport).route(input)).toMatchObject({ status: "FAILURE", reason: "INVALID_RESPONSE" });
  });
});
