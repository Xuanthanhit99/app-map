import { describe, expect, it, vi } from "vitest";
import { checkPlanRoute } from "../apps/mobile/src/infrastructure/api/routeVerificationClient";

const base = { baseUrl: "http://localhost:3001", planId: "plan-1", origin: [105.8, 21.0] as const, destination: [105.9, 21.1] as const };
describe("Mobile route verification", () => {
  it("does not call network without user-supplied origin", async () => {
    const fetcher = vi.fn();
    expect(await checkPlanRoute({ ...base, origin: null, fetcher })).toEqual({ status: "unavailable", reason: "ORIGIN_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not unlock journey on provider SUCCESS alone", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { status: "SUCCESS", provider: "provider", distanceMeters: 1000, durationSeconds: 120 } }) });
    expect(await checkPlanRoute({ ...base, fetcher })).toMatchObject({ status: "route_found_unverified", canStart: false });
  });
  it("reports NO_ROUTE without enabling journey", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { status: "FAILURE", reason: "NO_ROUTE" } }) });
    expect(await checkPlanRoute({ ...base, fetcher })).toMatchObject({ status: "error", reason: "NO_ROUTE" });
  });
});
