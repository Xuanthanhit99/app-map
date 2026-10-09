import { describe, expect, it } from "vitest";
import { getRealityDecisionCollection } from "../apps/mobile/src/infrastructure/api/realityDecisionClient";

const base = "http://127.0.0.1:3001";
const mock = (body: unknown, status = 200) => (async () => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
})) as typeof fetch;

describe("mobile Reality and Decision API client", () => {
  it("does not request an unconfigured endpoint", async () => {
    expect(await getRealityDecisionCollection(undefined, "reality")).toMatchObject({ status: "empty", reason: "API_NOT_CONFIGURED" });
  });
  it("preserves explicit empty evidence state", async () => {
    expect(await getRealityDecisionCollection(base, "decision", mock({ status: "empty", items: [], reason: "NO_VERIFIED_DATA" }))).toEqual({
      status: "empty", items: [], reason: "NO_VERIFIED_DATA",
    });
  });
  it("rejects malformed payloads", async () => {
    expect(await getRealityDecisionCollection(base, "reality", mock({ status: "ready", items: [{ fake: 1 }] }))).toMatchObject({ status: "error", reason: "INVALID_CONTRACT" });
  });
  it("reports upstream errors", async () => {
    expect(await getRealityDecisionCollection(base, "decision", mock({}, 503))).toMatchObject({ status: "error", reason: "HTTP_503" });
  });
});
