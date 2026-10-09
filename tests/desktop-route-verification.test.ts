import { describe, expect, it, vi } from "vitest";
import { verifySelectedPlanRoute } from "../apps/desktop/route-verification-client.mjs";

const input = { baseUrl: "http://127.0.0.1:3001", plan: { id: "plan-1" }, origin: [105.8, 21.0], destination: [105.9, 21.1] };
describe("Desktop route verification", () => {
  it("never requests routing without an explicit origin", async () => {
    const fetcher = vi.fn();
    expect(await verifySelectedPlanRoute({ ...input, origin: null, fetcher })).toMatchObject({ status: "unavailable", reason: "ORIGIN_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not enable journey even after successful routing", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { status: "SUCCESS", provider: "routing", distanceMeters: 1200, durationSeconds: 900 } }) });
    const result = await verifySelectedPlanRoute({ ...input, fetcher });
    expect(result).toMatchObject({ status: "route_found_unverified", canStart: false });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("reports provider failure", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { status: "FAILURE", reason: "NO_ROUTE" } }) });
    expect(await verifySelectedPlanRoute({ ...input, fetcher })).toMatchObject({ status: "error", reason: "NO_ROUTE" });
  });
});
