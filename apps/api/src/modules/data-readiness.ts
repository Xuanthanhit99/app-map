import type { Db } from "../db/pool";
import { tileBBox } from "../ingestion/framework";
import { weatherCells } from "../ingestion/adapters/open-meteo";
import type { CoverageRegion } from "../ingestion/regions";
import { PLACE_CATEGORIES } from "../../../../src/reality/categories";

export type DomainVerdict = "READY" | "PARTIAL" | "NOT_INGESTED" | "COMMUNITY_ONLY" | "NO_PROVIDER";

/**
 * Data Readiness Gate (G2). Measures what is actually in the database — never what a provider promises.
 * Live/real-time claims are only made for domains with an active, enabled live or forecast source.
 */
export async function computeDataReadiness(db: Db, regions: CoverageRegion[], now: Date) {
  const sources = await db.query(`SELECT s.id, s.name, s.kind, s.license, s.attribution, s.commercial_use, s.data_nature, s.enabled,
      h.circuit_state, h.consecutive_failures, h.last_success_at, h.last_failure_at, h.last_error_code
      FROM data_sources s JOIN source_health h ON h.source_id = s.id ORDER BY s.id`);
  const out = [];
  for (const region of regions) {
    const b = region.bbox;
    const env = [b.west, b.south, b.east, b.north];
    const tiles = tileBBox(b, 0.05);
    const placeRuns = await db.query<{ ok: number; latest: Date | null; failed: number }>(
      `SELECT count(DISTINCT scope->'bbox') FILTER (WHERE status = 'SUCCEEDED' AND finished_at > $2::timestamptz - interval '48 hours')::int AS ok,
              max(finished_at) FILTER (WHERE status = 'SUCCEEDED') AS latest,
              count(*) FILTER (WHERE status = 'FAILED' AND started_at > $2::timestamptz - interval '48 hours')::int AS failed
         FROM ingestion_runs WHERE source_id = 'osm-overpass' AND scope->>'regionId' = $1`, [region.id, now]);
    const places = await db.query<{ category: string; n: number }>(
      `SELECT category, count(*)::int AS n FROM places WHERE status = 'active'
          AND geom && ST_MakeEnvelope($1,$2,$3,$4,4326)::geography GROUP BY category`, env);
    const cells = weatherCells(b);
    const weather = await db.query<{ n: number; newest: Date | null }>(
      `SELECT count(DISTINCT ST_GeoHash(geom::geometry, 5))::int AS n, max(observed_at) AS newest FROM observations
        WHERE source_id = 'open-meteo' AND valid_until > $5 AND geom && ST_MakeEnvelope($1,$2,$3,$4,4326)::geography`, [...env, now]);
    const community = await db.query<{ domain: string; n: number }>(
      `SELECT domain, count(*)::int AS n FROM reports WHERE status IN ('PENDING','CORROBORATED','VERIFIED','DISPUTED')
          AND expires_at > $5 AND geom && ST_MakeEnvelope($1,$2,$3,$4,4326)::geography GROUP BY domain`, [...env, now]);

    // Query performance benchmark: nearby search around the region centre (20 runs, p50/p95).
    const timings: number[] = [];
    const cLat = (b.south + b.north) / 2, cLng = (b.west + b.east) / 2;
    for (let i = 0; i < 20; i++) {
      const t = process.hrtime.bigint();
      await db.query(`SELECT id FROM places WHERE status = 'active' AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, 2000)
                       ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1,$2),4326)::geography LIMIT 20`, [cLng + (i % 5) * 0.004, cLat + Math.floor(i / 5) * 0.004]);
      timings.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    timings.sort((x, y) => x - y);
    const placeTotal = places.rows.reduce((s, r) => s + r.n, 0);
    const okTiles = placeRuns.rows[0]?.ok ?? 0;
    const weatherCovered = weather.rows[0]?.n ?? 0;
    const placesVerdict: DomainVerdict = placeTotal === 0 ? "NOT_INGESTED" : okTiles >= tiles.length ? "READY" : "PARTIAL";
    const weatherVerdict: DomainVerdict = weatherCovered === 0 ? "NOT_INGESTED" : weatherCovered >= cells.length ? "READY" : "PARTIAL";
    out.push({
      region: { id: region.id, name: region.name, bbox: region.bbox },
      domains: {
        PLACES: { verdict: placesVerdict, nature: "STATIC_REFERENCE", source: "osm-overpass", total: placeTotal,
          byCategory: Object.fromEntries(PLACE_CATEGORIES.map((c) => [c.id, places.rows.find((r) => r.category === c.id)?.n ?? 0])),
          tilesIngested48h: okTiles, tilesTotal: tiles.length, latestSuccessAt: placeRuns.rows[0]?.latest?.toISOString() ?? null, failedRuns48h: placeRuns.rows[0]?.failed ?? 0 },
        WEATHER: { verdict: weatherVerdict, nature: "FORECAST", source: "open-meteo", cellsCovered: weatherCovered, cellsTotal: cells.length,
          newestModelTime: weather.rows[0]?.newest?.toISOString() ?? null,
          note: "Model nowcast/forecast, not a sensor observation." },
        ROAD: { verdict: (community.rows.find((r) => r.domain === "ROAD") ? "COMMUNITY_ONLY" : "NO_PROVIDER") as DomainVerdict,
          note: "No licensed live traffic or flood feed is connected. Road conditions come only from corroborated community reports.",
          activeReports: community.rows.find((r) => r.domain === "ROAD")?.n ?? 0 },
        PARKING: { verdict: "COMMUNITY_ONLY" as DomainVerdict, note: "No operator parking-availability feed; community reports only.", activeReports: community.rows.find((r) => r.domain === "PARKING")?.n ?? 0 },
        CROWD_QUEUE_OPEN: { verdict: "COMMUNITY_ONLY" as DomainVerdict, note: "No live business status feed; OSM opening_hours is a schedule only.",
          activeReports: community.rows.filter((r) => ["CROWD", "QUEUE", "PLACE_OPEN"].includes(r.domain)).reduce((s, r) => s + r.n, 0) },
        PUBLIC_TRANSPORT: { verdict: "NO_PROVIDER" as DomainVerdict, note: "No GTFS/GTFS-RT feed for Hà Nội has been licensed or connected." },
        EVENTS: { verdict: "NO_PROVIDER" as DomainVerdict, note: "No events provider connected." },
      },
      queryPerformance: { nearbySearchMs: { p50: round(timings[9]!), p95: round(timings[18]!), runs: 20 } },
    });
  }
  return {
    generatedAt: now.toISOString(),
    sources: sources.rows.map((s) => ({ id: s.id, name: s.name, kind: s.kind, license: s.license, attribution: s.attribution,
      commercialUse: s.commercial_use, nature: s.data_nature, enabled: s.enabled, circuit: s.circuit_state, consecutiveFailures: s.consecutive_failures,
      lastSuccessAt: s.last_success_at?.toISOString() ?? null, lastFailureAt: s.last_failure_at?.toISOString() ?? null, lastErrorCode: s.last_error_code })),
    regions: out,
  };
}
const round = (n: number) => Math.round(n * 100) / 100;
