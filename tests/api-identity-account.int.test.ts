import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDatabase, insertTestPlace, registerUser, startHarness, type Harness } from "./helpers/api-harness";

describe.skipIf(!hasTestDatabase)("G1/G9 identity, sessions, account, privacy (PostGIS)", () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => { await h?.close(); });

  it("health/ready reports database, PostGIS and migrations", async () => {
    const r = await h.request("GET", "/health/ready");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "ready", database: true, postgis: true, routingConfigured: false });
    expect(r.body.migrations).toBeGreaterThanOrEqual(3);
  });

  it("register validates input and rejects weak passwords and duplicates without leaking values", async () => {
    const bad = await h.request("POST", "/v1/auth/register", { body: { email: "not-an-email", password: "x", displayName: "" } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("VALIDATION_FAILED");
    expect(JSON.stringify(bad.body)).not.toContain("not-an-email");
    const weak = await h.request("POST", "/v1/auth/register", { body: { email: "weak@example.test", password: "password123", displayName: "A" } });
    expect(weak.status).toBe(400);
    expect(weak.body.error).toBe("WEAK_PASSWORD");
    const u = await registerUser(h, { email: "dup@example.test" });
    expect(u.token).toMatch(/^rat_/);
    const dup = await h.request("POST", "/v1/auth/register", { body: { email: "DUP@example.test", password: "another long secret", displayName: "B" } });
    expect(dup.status).toBe(409);
    const stored = await h.db.query("SELECT password_hash FROM users WHERE email = 'dup@example.test'");
    expect(stored.rows[0].password_hash).toMatch(/^scrypt\$32768\$8\$1\$/);
  });

  it("login, authenticated read, unknown/expired tokens rejected", async () => {
    const u = await registerUser(h, { email: "login@example.test", password: "a very long passphrase" });
    const wrong = await h.request("POST", "/v1/auth/login", { body: { email: "login@example.test", password: "nope nope nope" } });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe("INVALID_CREDENTIALS");
    const ok = await h.request("POST", "/v1/auth/login", { body: { email: "LOGIN@example.test", password: "a very long passphrase" } });
    expect(ok.status).toBe(200);
    const me = await h.request("GET", "/v1/me", { token: ok.body.tokens.accessToken });
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ id: u.id, email: "login@example.test", role: "user" });
    expect(me.body.user.password_hash).toBeUndefined();
    expect((await h.request("GET", "/v1/me")).status).toBe(401);
    expect((await h.request("GET", "/v1/me", { token: "rat_" + "x".repeat(43) })).status).toBe(401);
    h.clock.advance(16 * 60_000);
    const expired = await h.request("GET", "/v1/me", { token: ok.body.tokens.accessToken });
    expect(expired.status).toBe(401);
    expect(expired.body.error).toBe("INVALID_OR_EXPIRED_TOKEN");
    h.clock.advance(-16 * 60_000);
  });

  it("refresh rotates single-use tokens; reuse revokes the whole family", async () => {
    const u = await registerUser(h);
    const r1 = await h.request("POST", "/v1/auth/refresh", { body: { refreshToken: u.refresh } });
    expect(r1.status).toBe(200);
    const next = r1.body.tokens;
    expect(next.refreshToken).not.toBe(u.refresh);
    expect((await h.request("GET", "/v1/me", { token: u.token })).status).toBe(401); // rotated session's access token dies
    expect((await h.request("GET", "/v1/me", { token: next.accessToken })).status).toBe(200);
    const reuse = await h.request("POST", "/v1/auth/refresh", { body: { refreshToken: u.refresh } });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error).toBe("REFRESH_TOKEN_REVOKED");
    expect((await h.request("GET", "/v1/me", { token: next.accessToken })).status).toBe(401);
    const audit = await h.db.query("SELECT count(*)::int AS n FROM audit_events WHERE action = 'auth.refresh_reuse_detected' AND actor_id = $1", [u.id]);
    expect(audit.rows[0].n).toBe(1);
  });

  it("logout revokes; password change revokes other sessions", async () => {
    const u = await registerUser(h, { email: "pw@example.test", password: "first long password" });
    const other = await h.request("POST", "/v1/auth/login", { body: { email: "pw@example.test", password: "first long password" } });
    const change = await h.request("POST", "/v1/auth/password", { token: u.token, body: { currentPassword: "first long password", newPassword: "second long password" } });
    expect(change.status).toBe(204);
    expect((await h.request("GET", "/v1/me", { token: other.body.tokens.accessToken })).status).toBe(401);
    expect((await h.request("GET", "/v1/me", { token: u.token })).status).toBe(200);
    expect((await h.request("POST", "/v1/auth/logout", { token: u.token })).status).toBe(204);
    expect((await h.request("GET", "/v1/me", { token: u.token })).status).toBe(401);
  });

  it("consent ledger is versioned and revocable", async () => {
    const u = await registerUser(h);
    const g = await h.request("POST", "/v1/me/consents", { token: u.token, body: { purpose: "contribution_public", granted: true } });
    expect(g.body.consents.contribution_public).toMatchObject({ granted: true, policyVersion: g.body.policyVersion });
    const r = await h.request("POST", "/v1/me/consents", { token: u.token, body: { purpose: "contribution_public", granted: false } });
    expect(r.body.consents.contribution_public.granted).toBe(false);
    const bad = await h.request("POST", "/v1/me/consents", { token: u.token, body: { purpose: "sell_my_data", granted: true } });
    expect(bad.status).toBe(400);
  });

  it("preferences and saved places are owner-scoped", async () => {
    const a = await registerUser(h);
    const b = await registerUser(h);
    const prefs = await h.request("PUT", "/v1/me/preferences", { token: a.token, body: { travelMode: "WALKING", accessibilityNeeds: ["STEP_FREE"], quietHours: { startHour: 22, endHour: 24 } } });
    expect(prefs.body).toMatchObject({ travelMode: "WALKING", accessibilityNeeds: ["STEP_FREE"], quietHours: { startHour: 22, endHour: 24 } });
    const place = await insertTestPlace(h, { name: "Hồ Gươm test", category: "attraction", lat: 21.0287, lng: 105.8524 });
    expect((await h.request("POST", "/v1/me/saved-places", { token: a.token, body: { placeId: place.id, label: "Nhà" } })).status).toBe(204);
    expect((await h.request("GET", "/v1/me/saved-places", { token: a.token })).body.items).toHaveLength(1);
    expect((await h.request("GET", "/v1/me/saved-places", { token: b.token })).body.items).toHaveLength(0);
    const detail = await h.request("GET", `/v1/places/${place.id}`, { token: a.token });
    expect(detail.body.saved).toBe(true);
  });

  it("export contains the user's data; delete erases account and detaches reports", async () => {
    const u = await registerUser(h, { email: "erase@example.test", password: "gone with the wind 42" });
    await h.request("POST", "/v1/me/consents", { token: u.token, body: { purpose: "contribution_public", granted: true } });
    const report = await h.request("POST", "/v1/reports", { token: u.token, body: { domain: "ROAD", value: "SLOW", latitude: 21.03, longitude: 105.85, note: "gần nhà tôi" } });
    expect(report.status).toBe(201);
    const exp = await h.request("GET", "/v1/me/export", { token: u.token });
    expect(exp.status).toBe(200);
    expect(exp.body.format).toBe("reality-export/1");
    expect(exp.body.user.email).toBe("erase@example.test");
    expect(exp.body.reports).toHaveLength(1);
    expect(exp.body.consents.length).toBeGreaterThan(0);
    expect(JSON.stringify(exp.body)).not.toMatch(/password_hash|token_hash/);
    const noConfirm = await h.request("POST", "/v1/me/delete", { token: u.token, body: { password: "gone with the wind 42" } });
    expect(noConfirm.status).toBe(400);
    const wrong = await h.request("POST", "/v1/me/delete", { token: u.token, body: { password: "wrong password!!", confirm: "XOA TAI KHOAN" } });
    expect(wrong.status).toBe(401);
    const del = await h.request("POST", "/v1/me/delete", { token: u.token, body: { password: "gone with the wind 42", confirm: "XOA TAI KHOAN" } });
    expect(del.status).toBe(204);
    expect((await h.db.query("SELECT 1 FROM users WHERE id = $1", [u.id])).rowCount).toBe(0);
    expect((await h.db.query("SELECT 1 FROM sessions WHERE user_id = $1", [u.id])).rowCount).toBe(0);
    const kept = await h.db.query("SELECT reporter_id, note FROM reports WHERE id = $1", [report.body.report.id]);
    expect(kept.rows[0]).toEqual({ reporter_id: null, note: null });
    const login = await h.request("POST", "/v1/auth/login", { body: { email: "erase@example.test", password: "gone with the wind 42" } });
    expect(login.status).toBe(401);
  });

  it("enforces CORS allow-list, JSON content type, body limits and method rules", async () => {
    const cors = await h.request("GET", "/health/live", { headers: { origin: "https://evil.example" } });
    expect(cors.status).toBe(403);
    const okCors = await h.request("OPTIONS", "/v1/me", { headers: { origin: "http://localhost:3000" } });
    expect(okCors.status).toBe(204);
    expect(okCors.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    const type = await h.request("POST", "/v1/auth/login", { body: "email=a", headers: { "content-type": "text/plain" } });
    expect(type.status).toBe(415);
    const big = await h.request("POST", "/v1/auth/login", { body: { email: "a@b.c", password: "x".repeat(20_000) } });
    expect(big.status).toBe(413);
    const method = await h.request("DELETE", "/v1/places/categories");
    expect(method.status).toBe(405);
    const json = await h.request("POST", "/v1/auth/login", { body: "{oops", headers: { "content-type": "application/json" } });
    expect(json.status).toBe(400);
    expect(json.body.error).toBe("INVALID_JSON");
  });

  it("rate-limits repeated failed logins per account", async () => {
    await registerUser(h, { email: "brute@example.test", password: "the right password" });
    let last = 0;
    for (let i = 0; i < 9; i++) last = (await h.request("POST", "/v1/auth/login", { body: { email: "brute@example.test", password: `wrong password ${i}` } })).status;
    expect(last).toBe(429);
  });
});
