import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { handleVerifiedDecisionRead } from "../apps/api/src/verified-decision-http";
import { queryDecisionPlans as mobile } from "../apps/mobile/src/infrastructure/api/realityDecisionClient";
import { queryDecisionPlans as web } from "../apps/desktop/reality-client.mjs";

function bridge(places: unknown[], fail = false): typeof fetch {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const raw = String(init?.body ?? "");
    const req = Object.assign(Readable.from(raw ? [Buffer.from(raw)] : []), {
      method: init?.method ?? "GET", url: new URL(String(url)).pathname,
      headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(raw)) },
    }) as unknown as IncomingMessage;
    let status = 500, body = "";
    const response = {
      setHeader: vi.fn(),
      writeHead: vi.fn((code: number) => { status = code; }),
      end: vi.fn((value: string) => { body = value; }),
    };
    await handleVerifiedDecisionRead(req, response as never, {
      listPlaces: async () => { if (fail) throw Error("private upstream token"); return places as never; },
    });
    return new Response(body, { status });
  }) as typeof fetch;
}
const intent = { intent: "Khám phá văn hóa", consentToUseContext: true };
const base = "https://api.example.test";
const fresh = () => ({
  id: "verified-1", title: "Licensed place", latitude: 21.03, longitude: 105.85,
  evidence: { truth: "KNOWN", source: "licensed-provider", provenanceId: "source-id",
    observedAt: new Date(Date.now() - 10000).toISOString() },
});
describe("Backend to Web and Mobile decision integration gate", () => {
  it.each([["web", web], ["mobile", mobile]])("%s requires consent and sends no implicit GPS", async (_name, client) => {
    const fetcher = bridge([fresh()]);
    expect((await client(base, { ...intent, consentToUseContext: false }, fetcher)).status).toBe("empty");
    expect(fetcher).not.toHaveBeenCalled();
    const result = await client(base, intent, fetcher);
    expect(result.status).toBe("ready");
    expect(result.items).toHaveLength(1);
    const calls = vi.mocked(fetcher).mock.calls;
    expect(new URL(String(calls[0][0])).pathname).toBe("/v1/decision/plans/query");
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual(intent);
  });
  it.each([["web", web], ["mobile", mobile]])("%s fails closed for empty, stale, conflict and outage", async (_name, client) => {
    expect((await client(base, intent, bridge([]))).status).toBe("empty");
    expect((await client(base, intent, bridge([{ ...fresh(), evidence: { ...fresh().evidence, observedAt: new Date(Date.now() - 3600000).toISOString() } }]))).status).toBe("empty");
    expect((await client(base, intent, bridge([{ ...fresh(), evidence: { ...fresh().evidence, truth: "CONFLICT" } }]))).status).toBe("empty");
    const failed = await client(base, intent, bridge([], true));
    expect(failed.status).toBe("error");
    expect(failed.items).toEqual([]);
    expect(JSON.stringify(failed)).not.toContain("private upstream");
  });
  it("keeps journey start disabled and requires explicit action in both UIs", () => {
    const html = readFileSync(new URL("../apps/desktop/index.html", import.meta.url), "utf8");
    const mobileScreen = readFileSync(new URL("../apps/mobile/app/(tabs)/journey.tsx", import.meta.url), "utf8");
    expect(html).toContain("data-decision-form");
    expect(html).toContain("data-decision-consent");
    expect(html).toContain("queryDecisionPlans(apiBase");
    expect(html).toMatch(/class="gold" disabled>Đi kế hoạch này/);
    expect(mobileScreen).toContain('accessibilityRole="checkbox"');
    expect(mobileScreen).toContain("queryDecisionPlans(process.env.EXPO_PUBLIC_API_BASE_URL");
    expect(mobileScreen).toContain("Theo dõi hành trình chưa khả dụng");
  });
});
