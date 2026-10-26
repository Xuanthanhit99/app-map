import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoutingProvider } from "../src/routing/routing-contract";
import { hasTestDatabase, insertTestPlace, makeRole, registerUser, startHarness, type Harness } from "./helpers/api-harness";

const ORIGIN = { latitude: 21.0287, longitude: 105.8524 };

/** Test double: a deterministic straight two-leg route. Production uses TomTom (TOMTOM_API_KEY). */
const fakeRouting: RoutingProvider = {
  id: "test-routing",
  async route(req) {
    const [o, d] = [req.origin, req.destination];
    return { status: "SUCCESS", provider: "test-routing", distanceMeters: 2400, durationSeconds: 600,
      route: { id: "r1", source: "ROUTING_ENGINE", generatedAt: Date.now(), coordinates: [o, [(o[0] + d[0]) / 2, (o[1] + d[1]) / 2], d] } };
  },
};

async function contributor(h: Harness) {
  const u = await registerUser(h);
  await h.request("POST", "/v1/me/consents", { token: u.token, body: { purpose: "contribution_public", granted: true } });
  return u;
}

describe.skipIf(!hasTestDatabase)("Decision, Journey, Watch, Pulse, Stories, Admin (PostGIS)", () => {
  let h: Harness;
  let cafe: { id: string; slug: string }, park: { id: string; slug: string }, museum: { id: string; slug: string };
  beforeAll(async () => {
    h = await startHarness({ overrides: { routing: fakeRouting } });
    cafe = await insertTestPlace(h, { name: "Cà phê Lâm", category: "cafe", lat: 21.0300, lng: 105.8540, openingHours: "Mo-Su 07:00-22:00" });
    park = await insertTestPlace(h, { name: "Vườn hoa Lý Thái Tổ", category: "park", lat: 21.0270, lng: 105.8545 });
    museum = await insertTestPlace(h, { name: "Bảo tàng Cách mạng", category: "museum", lat: 21.0240, lng: 105.8580 });
  });
  afterAll(async () => { await h?.close(); });

  describe("Flow 06 — Đi đâu bây giờ?", () => {
    it("requires explicit location consent and an origin or area", async () => {
      expect((await h.request("POST", "/v1/decide", { body: { intent: "uống cà phê", origin: ORIGIN } })).body.error).toBe("LOCATION_CONSENT_REQUIRED");
      expect((await h.request("POST", "/v1/decide", { body: { intent: "uống cà phê" } })).body.error).toBe("ORIGIN_OR_AREA_REQUIRED");
    });

    it("asks for clarification instead of guessing", async () => {
      const r = await h.request("POST", "/v1/decide", { body: { intent: "hmm không biết", origin: ORIGIN, useLocation: true } });
      expect(r.body.status).toBe("needs_clarification");
      expect(r.body.suggestions.length).toBeGreaterThan(3);
    });

    it("ranks grounded options with explanations, labelled estimates and explicit unknowns", async () => {
      const r = await h.request("POST", "/v1/decide", { body: { intent: "muốn uống cà phê yên tĩnh", origin: ORIGIN, useLocation: true, availableMinutes: 90, mode: "WALKING" } });
      expect(r.status).toBe(200);
      expect(r.body.status).toBe("ready");
      const top = r.body.options[0];
      expect(top.place.id).toBe(cafe.id);
      expect(top.factors.map((f: { factor: string }) => f.factor)).toEqual(expect.arrayContaining(["CATEGORY", "DISTANCE", "TIME_FIT"]));
      expect(top.estimate).toMatchObject({ method: "STRAIGHT_LINE_X1_35_AVG_SPEED", label: expect.stringContaining("Ước tính") });
      expect(top.unknowns).toEqual(expect.arrayContaining([expect.stringContaining("Mở cửa"), expect.stringContaining("Mức đông")]));
      expect(r.body.coverage.join(" ")).toContain("ước tính");
    });

    it("uses verified state: a corroborated CLOSED place is excluded with evidence", async () => {
      const [a, b] = [await contributor(h), await contributor(h)];
      const at = { latitude: 21.0301, longitude: 105.8541, placeId: cafe.id };
      await h.request("POST", "/v1/reports", { token: a.token, body: { domain: "PLACE_OPEN", value: "TEMPORARILY_CLOSED", ...at } });
      await h.request("POST", "/v1/reports", { token: b.token, body: { domain: "PLACE_OPEN", value: "TEMPORARILY_CLOSED", ...at } });
      const r = await h.request("POST", "/v1/decide", { body: { intent: "cà phê", origin: ORIGIN, useLocation: true } });
      expect(r.body.options.find((o: { place: { id: string } }) => o.place.id === cafe.id)).toBeUndefined();
      expect(r.body.excluded[0]).toMatchObject({ place: { id: cafe.id }, reason: "Tạm đóng cửa (đã xác nhận)" });
    });

    it("weather forecast penalises outdoor places and is labelled as forecast evidence", async () => {
      await h.db.query(`INSERT INTO observations (domain, value, subject_type, geom, source_id, nature, observed_at, valid_until, confidence, dedupe_key)
        VALUES ('WEATHER','THUNDERSTORM','AREA_CELL', ST_SetSRID(ST_MakePoint(105.853,21.028),4326)::geography, 'open-meteo','FORECAST', $1, $2, 0.8, 'test-storm')`,
        [new Date(h.clock.now.getTime() - 5 * 60_000), new Date(h.clock.now.getTime() + 60 * 60_000)]);
      const r = await h.request("POST", "/v1/decide", { body: { intent: "đi dạo công viên hoặc bảo tàng", origin: ORIGIN, useLocation: true } });
      expect(r.body.options[0].place.id).toBe(museum.id);
      const parkOpt = [...r.body.options, ...r.body.alternatives].find((o: { place: { id: string } }) => o.place.id === park.id);
      expect(parkOpt).toBeDefined();
      const parkFull = r.body.options.find((o: { place: { id: string } }) => o.place.id === park.id);
      if (parkFull) {
        const w = parkFull.factors.find((f: { factor: string }) => f.factor === "WEATHER");
        expect(w).toMatchObject({ basis: "EVIDENCE", evidence: { nature: "FORECAST", sourceIds: ["open-meteo"] } });
        expect(parkFull.risks.join(" ")).toContain("dự báo");
      }
    });
  });

  describe("Journey engine", () => {
    let user: Awaited<ReturnType<typeof registerUser>>;
    let journeyId: string;
    beforeAll(async () => { user = await registerUser(h); });

    it("plans a journey to a place with a provider route (duration labelled as provider estimate)", async () => {
      const r = await h.request("POST", "/v1/journeys", { token: user.token, body: { origin: ORIGIN, destinationPlaceId: museum.id, mode: "WALKING" } });
      expect(r.status).toBe(201);
      expect(r.body.routing).toBe("OK");
      expect(r.body.journey).toMatchObject({ status: "PLANNED", routeStatus: "AVAILABLE", canStart: true, destinationLabel: "Bảo tàng Cách mạng" });
      expect(r.body.journey.route.durationLabel).toContain("Ước tính");
      journeyId = r.body.journey.id;
    });

    it("enforces ownership and lifecycle transitions; stale routes cannot start", async () => {
      const other = await registerUser(h);
      expect((await h.request("GET", `/v1/journeys/${journeyId}`, { token: other.token })).status).toBe(404);
      expect((await h.request("POST", `/v1/journeys/${journeyId}/events`, { token: user.token, body: { type: "PAUSE" } })).body.error).toBe("INVALID_JOURNEY_TRANSITION");
      h.clock.advance(16 * 60_000);
      // Access tokens live 15 minutes: rotate like a real client would.
      const refreshed = await h.request("POST", "/v1/auth/refresh", { body: { refreshToken: user.refresh } });
      user.token = refreshed.body.tokens.accessToken;
      user.refresh = refreshed.body.tokens.refreshToken;
      expect((await h.request("POST", `/v1/journeys/${journeyId}/events`, { token: user.token, body: { type: "START" } })).body.error).toBe("ROUTE_STALE");
      const rr = await h.request("POST", `/v1/journeys/${journeyId}/reroute`, { token: user.token, body: { origin: ORIGIN } });
      expect(rr.body.journey.route.revision).toBe(2);
      const start = await h.request("POST", `/v1/journeys/${journeyId}/events`, { token: user.token, body: { type: "START" } });
      expect(start.body.journey.status).toBe("ACTIVE");
    });

    it("positions are quality-gated, used transiently and never stored", async () => {
      const old = await h.request("POST", `/v1/journeys/${journeyId}/events`, { token: user.token, body: { type: "POSITION",
        position: { latitude: 21.0241, longitude: 105.8579, accuracyMeters: 10, observedAt: new Date(h.clock.now.getTime() - 60_000).toISOString() } } });
      expect(old.body.checks.position).toBe("REJECTED_QUALITY");
      const near = await h.request("POST", `/v1/journeys/${journeyId}/events`, { token: user.token, body: { type: "POSITION",
        position: { latitude: 21.0241, longitude: 105.8579, accuracyMeters: 10, observedAt: h.clock.now.toISOString() } } });
      expect(near.body.checks).toMatchObject({ arrivalDetected: true, offRoute: false });
      const events = await h.db.query("SELECT detail::text FROM journey_events WHERE journey_id = $1", [journeyId]);
      expect(events.rows.map((r) => r.detail).join(" ")).not.toContain("21.0241");
    });

    it("journey impact: a corroborated hazard on the route notifies with explicit severity", async () => {
      const [a, b] = [await contributor(h), await contributor(h)];
      const on = { latitude: 21.0264, longitude: 105.8552 }; // midpoint of the test route
      await h.request("POST", "/v1/reports", { token: a.token, body: { domain: "ROAD", value: "FLOODED_DEEP", ...on } });
      await h.request("POST", "/v1/reports", { token: b.token, body: { domain: "ROAD", value: "FLOODED_DEEP", ...on } });
      const impact = await h.request("GET", `/v1/journeys/${journeyId}/impact`, { token: user.token });
      expect(impact.body).toMatchObject({ status: "EVALUATED", worstSeverity: "SAFETY_CRITICAL", recommendation: "REROUTE_OR_POSTPONE" });
      expect(impact.body.items[0]).toMatchObject({ kind: "STATE", truth: "KNOWN", value: "FLOODED_DEEP", severity: "SAFETY_CRITICAL" });
      const n = await h.request("GET", "/v1/me/notifications", { token: user.token });
      expect(n.body.items.find((i: { kind: string }) => i.kind === "JOURNEY_IMPACT")).toMatchObject({ severity: "SAFETY_CRITICAL" });
    });

    it("arrive ends the journey; history lists it without geometry", async () => {
      const r = await h.request("POST", `/v1/journeys/${journeyId}/events`, { token: user.token, body: { type: "ARRIVE" } });
      expect(r.body.journey.status).toBe("ARRIVED");
      const list = await h.request("GET", "/v1/journeys", { token: user.token });
      expect(list.body.items[0].route.coordinates).toEqual([]);
    });

    it("without a routing provider a journey is created but cannot start (fails safe)", async () => {
      const h2 = await startHarness();
      try {
        const u = await registerUser(h2);
        const r = await h2.request("POST", "/v1/journeys", { token: u.token, body: { origin: ORIGIN, destination: { latitude: 21.04, longitude: 105.84 } } });
        expect(r.body).toMatchObject({ routing: "ROUTING_PROVIDER_NOT_CONFIGURED", journey: { routeStatus: "UNAVAILABLE", canStart: false } });
        expect((await h2.request("POST", `/v1/journeys/${r.body.journey.id}/events`, { token: u.token, body: { type: "START" } })).body.error).toBe("ROUTE_UNAVAILABLE");
      } finally { await h2.close(); }
    });

    it("ETA sharing needs flag + consent, is time-limited, revocable and exposes no position", async () => {
      const j = await h.request("POST", "/v1/journeys", { token: user.token, body: { origin: ORIGIN, destinationPlaceId: park.id } });
      const id = j.body.journey.id;
      expect((await h.request("POST", `/v1/journeys/${id}/shares`, { token: user.token, body: { ttlMinutes: 30 } })).body.error).toBe("FEATURE_DISABLED");
      await h.db.query("UPDATE feature_flags SET enabled = true WHERE key = 'journey_sharing'");
      expect((await h.request("POST", `/v1/journeys/${id}/shares`, { token: user.token, body: { ttlMinutes: 30 } })).body.error).toBe("SHARING_CONSENT_REQUIRED");
      await h.request("POST", "/v1/me/consents", { token: user.token, body: { purpose: "journey_sharing", granted: true } });
      const s = await h.request("POST", `/v1/journeys/${id}/shares`, { token: user.token, body: { ttlMinutes: 30 } });
      expect(s.status).toBe(201);
      const view = await h.request("GET", `/v1/shared-journeys/${s.body.token}`);
      expect(view.status).toBe(200);
      expect(Object.keys(view.body).sort()).toEqual(["destinationLabel", "estimatedArrival", "etaLabel", "expiresAt", "status"]);
      await h.request("POST", "/v1/me/consents", { token: user.token, body: { purpose: "journey_sharing", granted: false } });
      expect((await h.request("GET", `/v1/shared-journeys/${s.body.token}`)).status).toBe(404);
    });
  });

  describe("Watch areas, notifications, World Pulse", () => {
    it("notifies only on meaningful changes at or above the chosen severity, with cooldown", async () => {
      const watcher = await registerUser(h);
      const spot = { latitude: 21.0400, longitude: 105.8300 };
      const w = await h.request("POST", "/v1/me/watch-areas", { token: watcher.token, body: { kind: "CIRCLE", label: "Nhà", ...spot, radiusMeters: 500, domains: ["ROAD"], minSeverity: "SIGNIFICANT" } });
      expect(w.status).toBe(201);
      const [a, b, c] = [await contributor(h), await contributor(h), await contributor(h)];
      // A single unverified report is INFO: below threshold, no notification.
      await h.request("POST", "/v1/reports", { token: a.token, body: { domain: "ROAD", value: "FLOODED_MODERATE", ...spot } });
      expect((await h.request("GET", "/v1/me/notifications", { token: watcher.token })).body.items).toHaveLength(0);
      await h.request("POST", "/v1/reports", { token: b.token, body: { domain: "ROAD", value: "FLOODED_MODERATE", ...spot } });
      let n = await h.request("GET", "/v1/me/notifications", { token: watcher.token });
      expect(n.body.items).toHaveLength(1);
      expect(n.body.items[0]).toMatchObject({ kind: "WATCH_CHANGE", severity: "SIGNIFICANT", title: "Ngập vừa" });
      await h.request("POST", "/v1/reports", { token: c.token, body: { domain: "ROAD", value: "FLOODED_MODERATE", ...spot } });
      n = await h.request("GET", "/v1/me/notifications", { token: watcher.token });
      expect(n.body.items).toHaveLength(1);
      expect(n.body.unreadCount).toBe(1);
      await h.request("POST", "/v1/me/notifications/read", { token: watcher.token, body: { all: true } });
      expect((await h.request("GET", "/v1/me/notifications", { token: watcher.token })).body.unreadCount).toBe(0);
    });

    it("World Pulse lists changes with source, freshness, confidence, severity and follow-up", async () => {
      const r = await h.request("GET", "/v1/reality/pulse?bbox=105.82,21.02,105.86,21.05");
      expect(r.body.status).toBe("ready");
      const item = r.body.items[0];
      expect(item).toMatchObject({ truth: "KNOWN", freshness: "FRESH", followUp: "AVOID_OR_REROUTE" });
      expect(item.sources.length).toBeGreaterThan(0);
      expect(typeof item.confidence).toBe("number");
      expect((await h.request("GET", "/v1/reality/pulse?bbox=106.5,20.5,106.6,20.6")).body).toMatchObject({ status: "empty", reason: "NO_RECENT_CHANGES" });
      expect((await h.request("GET", "/v1/reality/pulses")).body.reason).toBe("AREA_REQUIRED");
    });

    it("watch areas are owner scoped and limited", async () => {
      const a = await registerUser(h), b = await registerUser(h);
      const w = await h.request("POST", "/v1/me/watch-areas", { token: a.token, body: { kind: "PLACE", placeId: museum.id, domains: ["CROWD", "QUEUE"] } });
      expect((await h.request("DELETE", `/v1/me/watch-areas/${w.body.id}`, { token: b.token })).status).toBe(404);
      expect((await h.request("GET", "/v1/me/watch-areas", { token: a.token })).body.items[0]).toMatchObject({ kind: "PLACE", label: "Bảo tàng Cách mạng" });
    });
  });

  describe("Stories and moderation", () => {
    it("draft → submit (requires sources) → moderator publish; drafts are private", async () => {
      const author = await registerUser(h);
      const mod = await registerUser(h);
      await makeRole(h, mod.id, "moderator");
      const body = { title: "Lịch sử Bảo tàng Cách mạng", summary: "Tòa nhà từng là kho bạc Đông Dương.", body: "Nội dung dài ".repeat(10), placeId: museum.id, sources: [] };
      const c = await h.request("POST", "/v1/stories", { token: author.token, body });
      expect(c.status).toBe(201);
      expect((await h.request("GET", `/v1/stories/${c.body.slug}`)).status).toBe(404);
      expect((await h.request("POST", `/v1/stories/${c.body.id}/submit`, { token: author.token })).body.error).toBe("SOURCE_ATTRIBUTION_REQUIRED");
      await h.request("PUT", `/v1/stories/${c.body.id}`, { token: author.token, body: { ...body, sources: [{ title: "Bảo tàng Lịch sử Quốc gia", url: "https://baotanglichsu.vn" }] } });
      expect((await h.request("POST", `/v1/stories/${c.body.id}/submit`, { token: author.token })).status).toBe(204);
      expect((await h.request("POST", `/v1/admin/stories/${c.body.id}/moderate`, { token: author.token, body: { action: "PUBLISH", reason: "ok" } })).status).toBe(403);
      expect((await h.request("POST", `/v1/admin/stories/${c.body.id}/moderate`, { token: mod.token, body: { action: "PUBLISH", reason: "Đã kiểm tra nguồn" } })).status).toBe(204);
      const pub = await h.request("GET", `/v1/stories/${c.body.slug}`);
      expect(pub.body.story).toMatchObject({ status: "PUBLISHED", place: { id: museum.id } });
      const place = await h.request("GET", `/v1/places/${museum.slug}`);
      expect(place.body.stories[0].slug).toBe(c.body.slug);
    });
  });

  describe("Admin console API (RBAC + audit)", () => {
    it("rejects non-staff and records moderation in the audit log", async () => {
      const user = await registerUser(h);
      const mod = await registerUser(h);
      const admin = await registerUser(h);
      await makeRole(h, mod.id, "moderator");
      await makeRole(h, admin.id, "admin");
      expect((await h.request("GET", "/v1/admin/dashboard", { token: user.token })).body.error).toBe("INSUFFICIENT_ROLE");
      const dash = await h.request("GET", "/v1/admin/dashboard", { token: mod.token });
      expect(dash.status).toBe(200);
      expect(dash.body.counts.places).toBeGreaterThanOrEqual(3);
      expect((await h.request("GET", "/v1/admin/audit", { token: mod.token })).status).toBe(403);
      expect((await h.request("PATCH", "/v1/admin/flags/ai_assistant", { token: mod.token, body: { enabled: true } })).status).toBe(403);

      const reporter = await contributor(h);
      const r = await h.request("POST", "/v1/reports", { token: reporter.token, body: { domain: "ROAD", value: "BLOCKED", latitude: 21.05, longitude: 105.81 } });
      const v = await h.request("POST", `/v1/admin/reports/${r.body.report.id}/moderate`, { token: mod.token, body: { action: "VERIFY", reason: "Camera giao thông xác nhận" } });
      expect(v.body).toMatchObject({ report: { status: "VERIFIED" }, stateChanged: true });
      const states = await h.request("GET", "/v1/reality/states?bbox=105.80,21.04,105.82,21.06&domains=ROAD");
      expect(states.body.items[0]).toMatchObject({ truth: "KNOWN", value: "BLOCKED", safety: "BLOCKED" });
      expect(states.body.items[0].sources.map((s: { id: string }) => s.id)).toContain("reality-moderation");

      const ban = await h.request("PATCH", `/v1/admin/users/${user.id}`, { token: mod.token, body: { status: "suspended", reason: "Spam báo cáo" } });
      expect(ban.status).toBe(204);
      expect((await h.request("GET", "/v1/me", { token: user.token })).status).toBe(401);
      expect((await h.request("PATCH", `/v1/admin/users/${user.id}`, { token: mod.token, body: { role: "admin", reason: "nope" } })).status).toBe(403);
      const audit = await h.request("GET", "/v1/admin/audit?action=moderation.report_verify", { token: admin.token });
      expect(audit.body.items[0]).toMatchObject({ actor_id: mod.id, target_id: r.body.report.id });
      const incident = await h.request("POST", "/v1/admin/incidents", { token: mod.token, body: { title: "Đường bị chặn do sự cố", severity: "SAFETY_CRITICAL", reportIds: [r.body.report.id] } });
      expect(incident.status).toBe(201);
    });
  });
});
