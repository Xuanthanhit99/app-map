import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildOverpassQuery, normalizeOverpass, OverpassAdapter } from "../apps/api/src/ingestion/adapters/osm-overpass";
import { normalizeOpenMeteo, OpenMeteoAdapter, weatherCells, weatherValue } from "../apps/api/src/ingestion/adapters/open-meteo";
import { runIngestion, tileBBox } from "../apps/api/src/ingestion/framework";
import { circuitAllows, withRetry, TransientError, PermanentError } from "../apps/api/src/lib/resilience";
import { registerAll } from "../apps/api/src/modules/registry";
import { hasTestDatabase, makeRole, registerUser, startHarness, type Harness } from "./helpers/api-harness";

// ── Recorded-shape payloads (test fixtures only; never loaded by production code) ──
const OVERPASS_PAYLOAD = {
  elements: [
    { type: "node", id: 101, lat: 21.0301, lon: 105.8521, tags: { amenity: "cafe", name: "Cộng Cà Phê", "addr:street": "Nhà Thờ", "addr:housenumber": "27", opening_hours: "Mo-Su 07:00-23:00", website: "https://congcaphe.com", wheelchair: "limited" } },
    { type: "way", id: 202, center: { lat: 21.0255, lon: 105.8575 }, tags: { tourism: "museum", name: "Bảo tàng Lịch sử Quốc gia", "addr:street": "Tràng Tiền", phone: "+84 24 3825 2853" } },
    { type: "node", id: 303, lat: 21.03, lon: 105.85, tags: { amenity: "cafe" } }, // no name → rejected
    { type: "node", id: 404, lat: 21.03, lon: 105.85, tags: { amenity: "bench", name: "Ghế" } }, // unknown category → rejected
    { type: "node", id: 101, lat: 21.0301, lon: 105.8521, tags: { amenity: "cafe", name: "Cộng Cà Phê" } }, // duplicate → rejected
  ],
};

function fakeTransport(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fn = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new Error("unexpected url");
    return routes[key]!();
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

describe("ingestion adapters (pure)", () => {
  it("builds a bounded Overpass query only for named catalog features", () => {
    const q = buildOverpassQuery({ regionId: "x", bbox: { west: 105.8, south: 21, east: 105.85, north: 21.05 }, categories: ["cafe"] });
    expect(q).toBe('[out:json][timeout:90];(nwr["amenity"="cafe"]["name"](21,105.8,21.05,105.85););out center tags;');
  });
  it("normalizes OSM elements and counts rejects (no name, unknown category, duplicates)", () => {
    const r = normalizeOverpass(OVERPASS_PAYLOAD);
    expect(r.rejected).toBe(3);
    expect(r.records).toEqual([
      expect.objectContaining({ ref: "node/101", name: "Cộng Cà Phê", category: "cafe", address: "27, Nhà Thờ", openingHours: "Mo-Su 07:00-23:00", wheelchair: "limited", website: "https://congcaphe.com" }),
      expect.objectContaining({ ref: "way/202", category: "museum", lat: 21.0255, lng: 105.8575, phone: "+84 24 3825 2853" }),
    ]);
    expect(() => normalizeOverpass({ nope: true })).toThrow(PermanentError);
  });
  it("maps WMO codes to catalog values and refuses unknown codes", () => {
    expect(weatherValue(0, 0)).toBe("CLEAR");
    expect(weatherValue(63, 2)).toBe("RAIN_LIGHT");
    expect(weatherValue(63, 9)).toBe("RAIN_HEAVY");
    expect(weatherValue(95, 0)).toBe("THUNDERSTORM");
    expect(weatherValue(71, 0)).toBeNull();
  });
  it("rejects model times in the future or too old", () => {
    const now = new Date("2026-10-22T03:00:00Z");
    const cells = [{ cell: "w7er8", lat: 21, lng: 105.8 }, { cell: "w7er9", lat: 21.04, lng: 105.8 }, { cell: "w7erb", lat: 21.04, lng: 105.84 }];
    const r = normalizeOpenMeteo([
      { current: { time: "2026-10-22T02:45", weather_code: 61, precipitation: 0.4, temperature_2m: 27.1 } },
      { current: { time: "2026-10-22T04:00", weather_code: 0 } },
      { current: { time: "2026-10-21T20:00", weather_code: 0 } },
    ], cells, now);
    expect(r.rejected).toBe(2);
    expect(r.records[0]).toMatchObject({ value: "RAIN_LIGHT", detail: { weatherCode: 61, precipitationMm: 0.4, temperatureC: 27.1 } });
  });
  it("tiles a bbox and caps weather cells", () => {
    expect(tileBBox({ west: 105.78, south: 20.98, east: 105.88, north: 21.08 }, 0.05)).toHaveLength(4);
    expect(() => weatherCells({ west: 105, south: 20, east: 106, north: 21 })).toThrow("TOO_MANY_WEATHER_CELLS");
  });
  it("retries only transient errors with backoff; circuit half-opens after the open window", async () => {
    let n = 0;
    const r = await withRetry(async () => { if (++n < 3) throw new TransientError("HTTP_503"); return "ok"; }, { attempts: 3, baseDelayMs: 1, maxDelayMs: 2, sleep: async () => undefined });
    expect(r).toEqual({ value: "ok", attempts: 3 });
    await expect(withRetry(async () => { throw new PermanentError("HTTP_400"); }, { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => undefined })).rejects.toThrow("HTTP_400");
    const t0 = new Date("2026-10-22T00:00:00Z");
    expect(circuitAllows("OPEN", t0, new Date(t0.getTime() + 60_000))).toEqual({ allowed: false, next: "OPEN" });
    expect(circuitAllows("OPEN", t0, new Date(t0.getTime() + 600_000))).toEqual({ allowed: true, next: "HALF_OPEN" });
  });
});

describe.skipIf(!hasTestDatabase)("G2 ingestion runs, idempotency, circuit breaker, readiness (PostGIS)", () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => { await h?.close(); });
  const scope = { regionId: "ha-noi", bbox: { west: 105.84, south: 21.02, east: 105.87, north: 21.04 } };
  const noSleep = { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => undefined };

  it("ingests places with provenance, is idempotent per window, retires vanished places", async () => {
    const transport = fakeTransport({ "https://overpass.test": () => new Response(JSON.stringify(OVERPASS_PAYLOAD), { status: 200 }) });
    const adapter = new OverpassAdapter("https://overpass.test/api/interpreter", "REALITY-test", transport);
    const r1 = await runIngestion(h.db, adapter, scope, h.clock.now, noSleep);
    expect(r1).toMatchObject({ status: "SUCCEEDED", upserted: 2, rejected: 3, recordsIn: 5 });
    const run = await h.db.query("SELECT status, records_upserted FROM ingestion_runs WHERE id = $1", [(r1 as { runId: string }).runId]);
    expect(run.rows[0]).toEqual({ status: "SUCCEEDED", records_upserted: 2 });
    const place = await h.db.query("SELECT slug, ingestion_run_id, source_id FROM places WHERE source_ref = 'node/101'");
    expect(place.rows[0]).toMatchObject({ slug: "cong-ca-phe-n101", source_id: "osm-overpass", ingestion_run_id: (r1 as { runId: string }).runId });
    expect(await runIngestion(h.db, adapter, scope, h.clock.now, noSleep)).toEqual({ status: "SKIPPED", reason: "ALREADY_INGESTED" });

    const later = new Date(h.clock.now.getTime() + 25 * 3_600_000);
    const shrunk = fakeTransport({ "https://overpass.test": () => new Response(JSON.stringify({ elements: [OVERPASS_PAYLOAD.elements[0]] }), { status: 200 }) });
    await runIngestion(h.db, new OverpassAdapter("https://overpass.test/api/interpreter", "REALITY-test", shrunk), scope, later, noSleep);
    const museum = await h.db.query("SELECT status FROM places WHERE source_ref = 'way/202'");
    expect(museum.rows[0].status).toBe("removed");
    expect(shrunk.calls[0]).toContain("overpass.test");
  });

  it("opens the circuit after repeated failures and records error codes", async () => {
    const failing = fakeTransport({ "https://meteo.test": () => new Response("busy", { status: 503 }) });
    const adapter = new OpenMeteoAdapter("https://meteo.test/v1/forecast", "REALITY-test", failing);
    let t = h.clock.now.getTime();
    for (let i = 0; i < 5; i++) {
      t += 16 * 60_000;
      const r = await runIngestion(h.db, adapter, scope, new Date(t), noSleep);
      expect(r).toMatchObject({ status: "FAILED", errorCode: "HTTP_503", attempts: 3 });
    }
    const health = await h.db.query("SELECT circuit_state, consecutive_failures, last_error_code FROM source_health WHERE source_id = 'open-meteo'");
    expect(health.rows[0]).toEqual({ circuit_state: "OPEN", consecutive_failures: 5, last_error_code: "HTTP_503" });
    expect(await runIngestion(h.db, adapter, scope, new Date(t + 60_000), noSleep)).toEqual({ status: "SKIPPED", reason: "CIRCUIT_OPEN" });
    await h.db.query("UPDATE source_health SET circuit_state = 'CLOSED', consecutive_failures = 0, opened_at = NULL WHERE source_id = 'open-meteo'");
  });

  it("ingests weather as FORECAST evidence and the state engine labels it so", async () => {
    const cells = weatherCells(scope.bbox);
    const time = new Date(h.clock.now.getTime() - 10 * 60_000).toISOString().slice(0, 16);
    const transport = fakeTransport({ "https://meteo.test": () => new Response(JSON.stringify(cells.map(() => ({ current: { time, weather_code: 65, precipitation: 12, temperature_2m: 26 } }))), { status: 200 }) });
    const r = await runIngestion(h.db, new OpenMeteoAdapter("https://meteo.test/v1/forecast", "REALITY-test", transport), scope, h.clock.now, noSleep);
    expect(r).toMatchObject({ status: "SUCCEEDED", upserted: cells.length });
    const url = new URL(transport.calls[0]!);
    expect(url.searchParams.get("current")).toContain("weather_code");
    const states = await h.request("GET", `/v1/reality/states?bbox=${scope.bbox.west},${scope.bbox.south},${scope.bbox.east},${scope.bbox.north}&domains=WEATHER`);
    expect(states.body.items[0]).toMatchObject({ truth: "KNOWN", value: "RAIN_HEAVY", nature: "FORECAST", safety: "CAUTION", sources: [{ id: "open-meteo", attribution: "Weather data by Open-Meteo.com" }] });
  });

  it("data readiness reports real coverage per domain and never claims live road data", async () => {
    const admin = await registerUser(h);
    await makeRole(h, admin.id, "admin");
    const r = await h.request("GET", "/v1/admin/data-readiness", { token: admin.token });
    expect(r.status).toBe(200);
    const region = r.body.regions[0];
    expect(region.domains.ROAD.verdict).toBe("NO_PROVIDER");
    expect(region.domains.PUBLIC_TRANSPORT.verdict).toBe("NO_PROVIDER");
    expect(region.domains.PLACES.total).toBeGreaterThanOrEqual(1);
    expect(["PARTIAL", "READY"]).toContain(region.domains.PLACES.verdict);
    expect(region.queryPerformance.nearbySearchMs.p95).toBeLessThan(200);
    expect(r.body.sources.find((s: { id: string }) => s.id === "open-meteo")).toMatchObject({ commercialUse: "RESTRICTED", nature: "FORECAST" });
  });

  it("admin can trigger jobs (audited) with an injected transport", async () => {
    const h2 = await startHarness({ extra: registerAll({ transport: fakeTransport({
      "https://overpass-api.de": () => new Response(JSON.stringify(OVERPASS_PAYLOAD), { status: 200 }),
    }) }) });
    try {
      const admin = await registerUser(h2);
      await makeRole(h2, admin.id, "admin");
      const r = await h2.request("POST", "/v1/admin/ingestion/run", { token: admin.token, body: { job: "places", regionId: "ha-noi" } });
      expect(r.status).toBe(200);
      expect(r.body.result.filter((x: { status: string }) => x.status === "SUCCEEDED")).toHaveLength(4);
      const audit = await h2.db.query("SELECT count(*)::int AS n FROM audit_events WHERE action = 'admin.ingestion_triggered'");
      expect(audit.rows[0].n).toBe(1);
      const areas = await h2.request("GET", "/v1/areas");
      expect(areas.body.items[0]).toMatchObject({ id: "ha-noi" });
    } finally { await h2.close(); }
  });
});
