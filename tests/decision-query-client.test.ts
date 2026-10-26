import { describe, expect, it, vi } from "vitest";
import { queryDecisionPlans as queryMobile } from "../apps/mobile/src/infrastructure/api/realityDecisionClient";
import { queryDecisionPlans as queryDesktop } from "../apps/desktop/reality-client.mjs";

describe("explicit decision query client contracts", () => {
  it("never sends a request without explicit consent", async () => {
    const fetcher = vi.fn();
    expect((await queryMobile("https://api.example", { intent: "explore", consentToUseContext: false }, fetcher)).status).toBe("empty");
    expect((await queryDesktop("https://api.example", { intent: "explore", consentToUseContext: false }, fetcher)).status).toBe("empty");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends only user-supplied intent and consent, and rejects unverified items", async () => {
    const fetcher: typeof fetch = vi.fn(async () => new Response(JSON.stringify({ status: "ready", items: [{ id: "p1", title: "Unverified", stops: [{ placeId: "p1" }], evidence: { truth: "UNKNOWN" } }] }), { status: 200 }));
    expect((await queryMobile("https://api.example", { intent: "explore", consentToUseContext: true }, fetcher)).status).toBe("empty");
    expect((await queryDesktop("https://api.example", { intent: "explore", consentToUseContext: true }, fetcher)).status).toBe("empty");
    const [, options] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({ intent: "explore", consentToUseContext: true });
  });
});
