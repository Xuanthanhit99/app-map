import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../apps/api/src/config";
import { applyRetention } from "../apps/api/src/ingestion/retention";
import { hasTestDatabase, registerUser, startHarness, type Harness } from "./helpers/api-harness";

describe("config refuses development doubles outside development/test", () => {
  it("fixtures and fake routing are rejected in qa/production; rate-limit scaling rejected in production", () => {
    const base = { DATABASE_URL: "postgres://x/y" };
    expect(() => loadConfig({ ...base, APP_ENV: "qa", ALLOW_DEV_FIXTURES: "true" } as unknown as NodeJS.ProcessEnv)).toThrow("DEV_FIXTURES_FORBIDDEN_IN_QA");
    expect(() => loadConfig({ ...base, APP_ENV: "production", DEV_FAKE_ROUTING: "true" } as unknown as NodeJS.ProcessEnv)).toThrow("DEV_FAKE_ROUTING_FORBIDDEN_IN_PRODUCTION");
    expect(() => loadConfig({ ...base, APP_ENV: "production", ROUTE_RATE_LIMIT_SCALE: "10" } as unknown as NodeJS.ProcessEnv)).toThrow("RATE_LIMIT_SCALE_FORBIDDEN_IN_PRODUCTION");
    expect(loadConfig({ ...base, APP_ENV: "production" } as unknown as NodeJS.ProcessEnv).rateLimitStore).toBe("postgres");
    expect(() => loadConfig({ APP_ENV: "qa" } as unknown as NodeJS.ProcessEnv)).toThrow("DATABASE_URL_REQUIRED");
  });
});

describe.skipIf(!hasTestDatabase)("G9 retention policy (PostGIS)", () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => { await h?.close(); });

  it("coarsens old report locations, drops old sessions, notifications, observations and audit rows", async () => {
    const u = await registerUser(h);
    await h.request("POST", "/v1/me/consents", { token: u.token, body: { purpose: "contribution_public", granted: true } });
    const r = await h.request("POST", "/v1/reports", { token: u.token, body: { domain: "ROAD", value: "SLOW", latitude: 21.03012, longitude: 105.85237, note: "ghi chú riêng" } });
    const later = new Date(h.clock.now.getTime() + 400 * 86_400_000);
    await h.db.query("UPDATE sessions SET refresh_expires_at = $2 WHERE user_id = $1", [u.id, new Date(h.clock.now.getTime() + 86_400_000)]);
    await h.db.query("INSERT INTO notifications (user_id, kind, severity, title, body, dedupe_key, read_at) VALUES ($1,'SYSTEM','INFO','t','b','x',$2)", [u.id, h.clock.now]);
    const out = await applyRetention(h.db, later);
    expect(out.reportsCoarsened).toBe(1);
    expect(out.sessions).toBeGreaterThanOrEqual(1);
    expect(out.notifications).toBe(1);
    expect(out.observations).toBeGreaterThanOrEqual(1);
    expect(out.audit).toBeGreaterThanOrEqual(1);
    const rep = await h.db.query("SELECT note, ST_Y(geom::geometry) AS lat, public_cell, ST_GeoHash(geom::geometry, 7) AS cell FROM reports WHERE id = $1", [r.body.report.id]);
    expect(rep.rows[0].note).toBeNull();
    expect(rep.rows[0].lat).not.toBeCloseTo(21.03012, 5);
    expect(rep.rows[0].cell).toBe(rep.rows[0].public_cell);
    const again = await applyRetention(h.db, later);
    expect(again.reportsCoarsened).toBe(0);
  });
});
