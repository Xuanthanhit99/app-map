import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDatabase, insertTestPlace, registerUser, startHarness, type Harness } from "./helpers/api-harness";

const HOAN_KIEM = { lat: 21.0287, lng: 105.8524 };
const BBOX = "105.84,21.02,105.86,21.04";

async function contributor(h: Harness) {
  const u = await registerUser(h);
  await h.request("POST", "/v1/me/consents", { token: u.token, body: { purpose: "contribution_public", granted: true } });
  return u;
}

describe.skipIf(!hasTestDatabase)("G6 Reality State + Contribution & Trust (PostGIS)", () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => { await h?.close(); });

  it("contribution is opt-in", async () => {
    const u = await registerUser(h);
    const r = await h.request("POST", "/v1/reports", { token: u.token, body: { domain: "ROAD", value: "FLOODED_LIGHT", latitude: HOAN_KIEM.lat, longitude: HOAN_KIEM.lng } });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("CONTRIBUTION_CONSENT_REQUIRED");
  });

  it("empty area: no states, explicit reason (no fabricated data)", async () => {
    const r = await h.request("GET", `/v1/reality/states?bbox=106.5,20.5,106.6,20.6`);
    expect(r.body).toMatchObject({ status: "empty", items: [], reason: "NO_ACTIVE_EVIDENCE" });
  });

  it("validates domain/value, time and precision", async () => {
    const u = await contributor(h);
    const bad = await h.request("POST", "/v1/reports", { token: u.token, body: { domain: "ROAD", value: "LAVA", latitude: 21, longitude: 105 } });
    expect(bad.body.error).toBe("UNKNOWN_DOMAIN_VALUE");
    const future = await h.request("POST", "/v1/reports", { token: u.token, body: { domain: "ROAD", value: "SLOW", latitude: 21, longitude: 105, observedAt: new Date(h.clock.now.getTime() + 60_000).toISOString() } });
    expect(future.body.error).toBe("OBSERVED_IN_FUTURE");
    const old = await h.request("POST", "/v1/reports", { token: u.token, body: { domain: "ROAD", value: "SLOW", latitude: 21, longitude: 105, observedAt: new Date(h.clock.now.getTime() - 3 * 3_600_000).toISOString() } });
    expect(old.body.error).toBe("OBSERVATION_TOO_OLD");
    const fuzzy = await h.request("POST", "/v1/reports", { token: u.token, body: { domain: "ROAD", value: "SLOW", latitude: 21, longitude: 105, accuracyMeters: 900 } });
    expect(fuzzy.body.error).toBe("LOCATION_TOO_IMPRECISE");
    const placeBound = await h.request("POST", "/v1/reports", { token: u.token, body: { domain: "QUEUE", value: "LONG", latitude: 21, longitude: 105 } });
    expect(placeBound.body.error).toBe("PLACE_REQUIRED");
  });

  it("single report → UNKNOWN + REPORTED_UNVERIFIED; second distinct reporter → KNOWN; public view hides precise location", async () => {
    const a = await contributor(h);
    const b = await contributor(h);
    const r1 = await h.request("POST", "/v1/reports", { token: a.token, body: { domain: "ROAD", value: "FLOODED_MODERATE", latitude: HOAN_KIEM.lat, longitude: HOAN_KIEM.lng, moving: true } });
    expect(r1.status).toBe(201);
    expect(r1.body.report.status).toBe("PENDING");
    let states = await h.request("GET", `/v1/reality/states?bbox=${BBOX}&domains=ROAD`);
    expect(states.body.items).toHaveLength(1);
    expect(states.body.items[0]).toMatchObject({ truth: "UNKNOWN", safety: "NONE", reason: "SINGLE_UNVERIFIED_REPORT" });
    expect(states.body.items[0].signals[0]).toMatchObject({ type: "REPORTED_UNVERIFIED", value: "FLOODED_MODERATE" });

    // Same reporter again = duplicate, not corroboration.
    const dup = await h.request("POST", "/v1/reports", { token: a.token, body: { domain: "ROAD", value: "FLOODED_MODERATE", latitude: HOAN_KIEM.lat + 0.0003, longitude: HOAN_KIEM.lng } });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("DUPLICATE_REPORT");

    const r2 = await h.request("POST", "/v1/reports", { token: b.token, body: { domain: "ROAD", value: "FLOODED_MODERATE", latitude: HOAN_KIEM.lat + 0.0004, longitude: HOAN_KIEM.lng + 0.0004 } });
    expect(r2.status).toBe(201);
    expect(r2.body.report.status).toBe("CORROBORATED");
    expect(r2.body.stateChanged).toBe(true);
    states = await h.request("GET", `/v1/reality/states?bbox=${BBOX}&domains=ROAD`);
    expect(states.body.items).toHaveLength(1);
    expect(states.body.items[0]).toMatchObject({ truth: "KNOWN", value: "FLOODED_MODERATE", safety: "AVOID", freshness: "FRESH", severity: "SIGNIFICANT", nature: "COMMUNITY_REPORT" });
    expect(states.body.items[0].sources[0]).toMatchObject({ id: "community" });

    const pub = await h.request("GET", `/v1/reports?bbox=${BBOX}`);
    expect(pub.body.items.length).toBe(2);
    const raw = JSON.stringify(pub.body);
    expect(raw).not.toContain(String(HOAN_KIEM.lat));
    expect(raw).not.toContain("reporter");
    expect(raw).not.toContain("note");
    expect(pub.body.items[0].cell).toHaveLength(7);

    const trust = await h.db.query("SELECT trust_score FROM users WHERE id = $1", [a.id]);
    expect(trust.rows[0].trust_score).toBeGreaterThan(0.5);
  });

  it("freshness ages independently of truth, and expired reports stop contributing", async () => {
    h.clock.advance(20 * 60_000);
    let states = await h.request("GET", `/v1/reality/states?bbox=${BBOX}&domains=ROAD`);
    expect(states.body.items[0]).toMatchObject({ truth: "KNOWN", freshness: "AGING" });
    h.clock.advance(80 * 60_000);
    states = await h.request("GET", `/v1/reality/states?bbox=${BBOX}&domains=ROAD`);
    expect(states.body.status).toBe("empty");
    h.clock.advance(-100 * 60_000);
  });

  it("place-bound reports require proximity; conflicting corroborated reports → CONFLICT", async () => {
    const place = await insertTestPlace(h, { name: "Bãi xe Tràng Tiền", category: "parking", lat: 21.0245, lng: 105.8560 });
    const far = await contributor(h);
    const tooFar = await h.request("POST", "/v1/reports", { token: far.token, body: { domain: "PARKING", value: "FULL", placeId: place.id, latitude: 21.10, longitude: 105.90 } });
    expect(tooFar.body.error).toBe("TOO_FAR_FROM_PLACE");
    const [a, b, c, d] = await Promise.all([contributor(h), contributor(h), contributor(h), contributor(h)]);
    const at = { latitude: 21.0246, longitude: 105.8561, placeId: place.id };
    await h.request("POST", "/v1/reports", { token: a.token, body: { domain: "PARKING", value: "FULL", ...at } });
    await h.request("POST", "/v1/reports", { token: b.token, body: { domain: "PARKING", value: "FULL", ...at } });
    let detail = await h.request("GET", `/v1/places/${place.slug}`);
    const parking = () => detail.body.states.find((s: { domain: string }) => s.domain === "PARKING");
    expect(parking()).toMatchObject({ truth: "KNOWN", value: "FULL", label: "Bãi đầy" });
    expect(detail.body.states.find((s: { domain: string }) => s.domain === "PLACE_OPEN")).toMatchObject({ truth: "UNKNOWN", reason: "NO_ACTIVE_EVIDENCE" });
    await h.request("POST", "/v1/reports", { token: c.token, body: { domain: "PARKING", value: "AVAILABLE", ...at } });
    await h.request("POST", "/v1/reports", { token: d.token, body: { domain: "PARKING", value: "AVAILABLE", ...at } });
    detail = await h.request("GET", `/v1/places/${place.id}`);
    expect(parking()).toMatchObject({ truth: "CONFLICT", value: null, safety: "NONE", freshness: "FRESH" });
    const statuses = await h.db.query("SELECT DISTINCT status FROM reports WHERE place_id = $1", [place.id]);
    expect(statuses.rows.map((r) => r.status)).toEqual(["DISPUTED"]);
  });

  it("votes: no self-votes, proximity required, confirmations corroborate", async () => {
    const reporter = await contributor(h);
    const voter = await contributor(h);
    const spot = { latitude: 21.0300, longitude: 105.8400 };
    const r = await h.request("POST", "/v1/reports", { token: reporter.token, body: { domain: "ROAD", value: "ACCIDENT", ...spot } });
    const id = r.body.report.id;
    expect((await h.request("POST", `/v1/reports/${id}/votes`, { token: reporter.token, body: { vote: "CONFIRM", ...spot } })).body.error).toBe("CANNOT_VOTE_OWN_REPORT");
    expect((await h.request("POST", `/v1/reports/${id}/votes`, { token: voter.token, body: { vote: "CONFIRM", latitude: 21.2, longitude: 105.84 } })).body.error).toBe("TOO_FAR_TO_VERIFY");
    const ok = await h.request("POST", `/v1/reports/${id}/votes`, { token: voter.token, body: { vote: "CONFIRM", ...spot } });
    expect(ok.status).toBe(200);
    expect(ok.body.report).toMatchObject({ status: "CORROBORATED", confirmCount: 1 });
    expect((await h.request("POST", `/v1/reports/${id}/votes`, { token: voter.token, body: { vote: "DENY", ...spot } })).status).toBe(409);
    const states = await h.request("GET", `/v1/reality/states?bbox=105.83,21.02,105.85,21.04&domains=ROAD`);
    expect(states.body.items.find((s: { value: string }) => s.value === "ACCIDENT")).toMatchObject({ truth: "KNOWN", safety: "CAUTION" });
  });

  it("low-trust reports are held and never evaluated", async () => {
    const u = await contributor(h);
    await h.db.query("UPDATE users SET trust_score = 0.05 WHERE id = $1", [u.id]);
    const r = await h.request("POST", "/v1/reports", { token: u.token, body: { domain: "ROAD", value: "BLOCKED", latitude: 21.05, longitude: 105.80 } });
    expect(r.status).toBe(201);
    expect(r.body.report.heldForReview).toBe(true);
    const states = await h.request("GET", `/v1/reality/states?bbox=105.79,21.04,105.81,21.06&domains=ROAD`);
    expect(states.body.status).toBe("empty");
    expect((await h.request("GET", `/v1/reports?bbox=105.79,21.04,105.81,21.06`)).body.items).toHaveLength(0);
  });

  it("withdrawing a report removes its evidence; mine lists own reports with note", async () => {
    const u = await contributor(h);
    const r = await h.request("POST", "/v1/reports", { token: u.token, body: { domain: "ROAD", value: "SLOW", latitude: 21.06, longitude: 105.81, note: "đông xe" } });
    const mine = await h.request("GET", "/v1/me/reports", { token: u.token });
    expect(mine.body.items[0]).toMatchObject({ id: r.body.report.id, note: "đông xe" });
    expect((await h.request("DELETE", `/v1/reports/${r.body.report.id}`, { token: u.token })).status).toBe(204);
    const states = await h.request("GET", `/v1/reality/states?bbox=105.80,21.05,105.82,21.07&domains=ROAD`);
    expect(states.body.status).toBe("empty");
  });

  it("places: nearby, search (accent-insensitive), categories, filters required", async () => {
    await insertTestPlace(h, { name: "Cà Phê Giảng", category: "cafe", lat: 21.0335, lng: 105.8540 });
    await insertTestPlace(h, { name: "Bảo tàng Lịch sử", category: "museum", lat: 21.0245, lng: 105.8600 });
    const near = await h.request("GET", `/v1/places?near=${HOAN_KIEM.lat},${HOAN_KIEM.lng}&radius=2000&category=cafe`);
    expect(near.body.items.map((p: { name: string }) => p.name)).toContain("Cà Phê Giảng");
    expect(near.body.items[0].distanceMeters).toBeGreaterThan(0);
    const search = await h.request("GET", `/v1/places?q=ca phe giang`);
    expect(search.body.items[0].name).toBe("Cà Phê Giảng");
    expect(search.body.items[0].source).toMatchObject({ id: "osm-overpass", license: "ODbL-1.0" });
    expect((await h.request("GET", "/v1/places")).body.error).toBe("FILTER_REQUIRED");
    expect((await h.request("GET", "/v1/places?category=spaceport")).body.error).toBe("UNKNOWN_CATEGORY");
    const cats = await h.request("GET", "/v1/places/categories");
    expect(cats.body.items.find((c: { id: string }) => c.id === "cafe").placeCount).toBeGreaterThanOrEqual(1);
    expect((await h.request("GET", "/v1/places/khong-ton-tai")).status).toBe(404);
  });
});
