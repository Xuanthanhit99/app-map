import { describe, expect, it } from "vitest";
import { loadReality, loadDecisionPlans } from "../apps/desktop/reality-client.mjs";

const base = "http://localhost:3001";
const response = (data: unknown, ok = true) => async () => ({ ok, status: ok ? 200 : 503, json: async () => data }) as Response;
describe("desktop API client", () => {
  it("does not call unconfigured API", async () => {
    expect(await loadReality("", () => { throw Error("called"); })).toMatchObject({ status: "empty", reason: "API_NOT_CONFIGURED" });
  });
  it("rejects malformed payloads", async () => {
    expect(await loadReality(base, response({ items: [{ bad: 1 }] }))).toMatchObject({ status: "error", reason: "INVALID_CONTRACT" });
  });
  it("preserves fresh conflict as uncertainty", async () => {
    const result = await loadReality(base, response({ items: [{ id: "road-1", evidence: { truth: "CONFLICT", observedAt: new Date().toISOString() } }] }));
    expect(result).toMatchObject({ status: "ready", items: [{ evidence: { truth: "CONFLICT", safeToAssert: false } }] });
  });
  it("rejects invented decision plans without source evidence", async () => {
    expect(await loadDecisionPlans(base, response({ items: [{ id: "a", title: "Plan A", stops: [], evidence: { truth: "UNKNOWN" } }] }))).toMatchObject({ status: "empty", items: [] });
  });
  it("distinguishes unavailable server", async () => {
    expect(await loadDecisionPlans(base, response({}, false))).toMatchObject({ status: "error", reason: "HTTP_503" });
  });
});
