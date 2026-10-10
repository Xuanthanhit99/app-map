import { describe, expect, it } from "vitest";
import { resolveEvidence, resolveCollection } from "../apps/desktop/state-engine.mjs";

describe("desktop evidence state", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  it("never promotes unknown evidence to live", () => {
    expect(resolveEvidence({ truth: "UNKNOWN", observedAt: "2026-10-08T11:59:00Z" }, now)).toMatchObject({ truth: "UNKNOWN", freshness: "FRESH", safeToAssert: false });
  });
  it("keeps fresh conflict uncertain", () => {
    expect(resolveEvidence({ truth: "CONFLICT", observedAt: "2026-10-08T11:59:00Z" }, now)).toMatchObject({ truth: "CONFLICT", freshness: "FRESH", safeToAssert: false });
  });
  it("requires provenance for known data", () => {
    expect(resolveEvidence({ truth: "KNOWN", observedAt: "2026-10-08T11:59:00Z" }, now).truth).toBe("UNKNOWN");
  });
  it("ages known data without erasing its truth status", () => {
    expect(resolveEvidence({ truth: "KNOWN", source: "provider", observedAt: "2026-10-08T11:50:00Z" }, now)).toMatchObject({ truth: "KNOWN", freshness: "AGING", safeToAssert: false });
  });
  it("rejects future timestamps", () => {
    expect(resolveEvidence({ truth: "KNOWN", source: "provider", observedAt: "2026-10-08T12:01:00Z" }, now).truth).toBe("UNKNOWN");
  });
  it("separates loading empty error ready", () => {
    expect(resolveCollection({ status: "loading" }).status).toBe("loading");
    expect(resolveCollection({ status: "error" }).status).toBe("error");
    expect(resolveCollection({ status: "ready", items: [] }).status).toBe("empty");
    expect(resolveCollection({ status: "ready", items: [{ id: 1 }] }).status).toBe("ready");
  });
});
