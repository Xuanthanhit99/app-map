import { describe, expect, it, vi } from "vitest";
import { collectionResponse, handleRealityDecisionRead } from "../apps/api/src/reality-decision-read";

describe("Reality and Decision read API", () => {
  it("does not fabricate incidents or plans", () => {
    for (const kind of ["reality", "decision"] as const) {
      const body = collectionResponse(kind, new Date("2026-10-09T00:00:00Z"));
      expect(body).toMatchObject({ status: "empty", items: [], reason: "NO_VERIFIED_DATA", provenance: [], evidence: { truth: "UNKNOWN", freshness: null, observedAt: null } });
      expect(body.generatedAt).toBe("2026-10-09T00:00:00.000Z");
    }
  });
  it("accepts GET only for both paths", () => {
    for (const url of ["/v1/reality/pulses", "/v1/decision/plans"]) {
      const response = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
      expect(handleRealityDecisionRead({ method: "POST", url } as never, response as never)).toBe(true);
      expect(response.writeHead).toHaveBeenCalledWith(405);
    }
  });
  it("does not intercept unrelated routes", () => {
    expect(handleRealityDecisionRead({ method: "GET", url: "/v1/routing/route" } as never, {} as never)).toBe(false);
  });
});
