import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { HttpVerifiedEvidenceRepository, evidenceRepositoryFromEnv, parseEvidencePlaces, readVerifiedPlaces } from "../apps/api/src/verified-evidence-repository";
import { handleVerifiedDecisionRead } from "../apps/api/src/verified-decision-http";

const now = new Date("2026-10-09T04:00:00Z");
const record = { id: "p1", title: "Verified destination", latitude: 21.03, longitude: 105.85,
  evidence: { truth: "KNOWN", source: "licensed-feed", provenanceId: "record-1", observedAt: "2026-10-09T03:59:00Z" } };

function response() {
  const state = { status: 0, body: "" };
  const output = { setHeader: vi.fn(), writeHead: vi.fn((status: number) => { state.status = status; }),
    end: vi.fn((value: string) => { state.body = value; }) };
  return { state, output };
}
function request(method: string, url: string, body?: unknown, contentType = "application/json") {
  const bytes = body === undefined ? "" : JSON.stringify(body);
  return Object.assign(Readable.from(bytes ? [Buffer.from(bytes)] : []), {
    method, url, headers: { "content-type": contentType, "content-length": String(Buffer.byteLength(bytes)) },
  });
}

describe("P0 evidence feed and explicit decision contract", () => {
  it("rejects invalid feed records, duplicate IDs and synthetic provenance", () => {
    expect(() => parseEvidencePlaces({ places: [{ ...record, latitude: 200 }] })).toThrow();
    expect(() => parseEvidencePlaces({ places: [record, record] })).toThrow();
    expect(() => parseEvidencePlaces({ places: [{ ...record, evidence: { ...record.evidence, truth: "FAKE" } }] })).toThrow();
  });
  it("requires complete feed configuration", () => {
    expect(() => evidenceRepositoryFromEnv({ EVIDENCE_FEED_URL: "https://example.com/feed" })).toThrow();
    expect(() => new HttpVerifiedEvidenceRepository(new URL("http://example.com/feed"), "token")).toThrow();
  });
  it("filters stale and conflicted feed observations", async () => {
    const feed = new HttpVerifiedEvidenceRepository(new URL("https://example.com/feed"), "token",
      vi.fn(async () => new Response(JSON.stringify({ places: [record, { ...record, id: "p2", evidence: { ...record.evidence, truth: "CONFLICT" } }, { ...record, id: "p3", evidence: { ...record.evidence, observedAt: "2026-10-09T03:00:00Z" } }] }), { status: 200 })) as typeof fetch);
    expect((await readVerifiedPlaces(feed, now.getTime())).map(p => p.id)).toEqual(["p1"]);
  });
  it("GET stays context-free and POST requires explicit consent", async () => {
    const repository = { listPlaces: async () => [record] };
    const get = response();
    await handleVerifiedDecisionRead(request("GET", "/v1/decision/plans"), get.output as never, repository, now);
    expect(JSON.parse(get.state.body).reason).toBe("INSUFFICIENT_CONTEXT");
    const invalid = response();
    await handleVerifiedDecisionRead(request("POST", "/v1/decision/plans/query", { intent: "explore", consentToUseContext: false }), invalid.output as never, repository, now);
    expect(invalid.state.status).toBe(400);
    const valid = response();
    await handleVerifiedDecisionRead(request("POST", "/v1/decision/plans/query", { intent: "explore", consentToUseContext: true }), valid.output as never, repository, now);
    expect(valid.state.status).toBe(200);
    expect(JSON.parse(valid.state.body).items).toHaveLength(1);
  });
  it("does not expose feed errors or invent plans", async () => {
    const out = response();
    await handleVerifiedDecisionRead(request("POST", "/v1/decision/plans/query", { intent: "explore", consentToUseContext: true }), out.output as never,
      { listPlaces: async () => { throw new Error("private upstream detail"); } }, now);
    expect(out.state.status).toBe(503);
    expect(out.state.body).not.toContain("private upstream detail");
  });
});
