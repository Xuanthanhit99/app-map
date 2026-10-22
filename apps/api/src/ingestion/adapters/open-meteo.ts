import type pg from "pg";
import { fetchJson, PermanentError } from "../../lib/resilience";
import { geohash, geohashCenter, type BBox } from "../../lib/geo";
import type { FetchResult, IngestionScope, SourceAdapter } from "../framework";

export type WeatherRecord = { cell: string; lat: number; lng: number; value: string; time: number; detail: Record<string, number> };

/** WMO weather code → REALITY WEATHER value. Codes outside the catalog (snow) are rejected, not guessed. */
export function weatherValue(code: number, precipitationMm: number | null): string | null {
  if (code === 0 || code === 1) return "CLEAR";
  if (code === 2 || code === 3) return "CLOUDY";
  if (code === 45 || code === 48) return "FOG";
  if (code >= 51 && code <= 57) return "DRIZZLE";
  if (code === 61 || code === 80) return "RAIN_LIGHT";
  if (code === 63 || code === 81) return (precipitationMm ?? 0) >= 7.6 ? "RAIN_HEAVY" : "RAIN_LIGHT";
  if (code === 65 || code === 82 || code === 66 || code === 67) return "RAIN_HEAVY";
  if (code === 95 || code === 96 || code === 99) return "THUNDERSTORM";
  return null;
}

/** Geohash-5 cell centres covering a bbox (≈4.9 km cells). */
export function weatherCells(b: BBox, max = 60): { cell: string; lat: number; lng: number }[] {
  const out = new Map<string, { cell: string; lat: number; lng: number }>();
  for (let lat = b.south; lat <= b.north + 1e-9; lat += 0.02) {
    for (let lng = b.west; lng <= b.east + 1e-9; lng += 0.02) {
      const cell = geohash(lat, lng, 5);
      if (!out.has(cell)) { const c = geohashCenter(cell); out.set(cell, { cell, lat: c.lat, lng: c.lng }); }
    }
  }
  const cells = [...out.values()];
  if (cells.length > max) throw new PermanentError("TOO_MANY_WEATHER_CELLS");
  return cells;
}

type Current = { time?: string; weather_code?: number; temperature_2m?: number; precipitation?: number; wind_speed_10m?: number; relative_humidity_2m?: number };

export function normalizeOpenMeteo(payload: unknown, cells: { cell: string; lat: number; lng: number }[], now: Date): FetchResult<WeatherRecord> {
  const list = Array.isArray(payload) ? payload : [payload];
  if (list.length !== cells.length) throw new PermanentError("OPEN_METEO_CARDINALITY_MISMATCH");
  const records: WeatherRecord[] = [];
  let rejected = 0;
  list.forEach((entry, i) => {
    const current = (entry as { current?: Current } | null)?.current;
    const cell = cells[i]!;
    const time = current?.time ? Date.parse(current.time.endsWith("Z") ? current.time : `${current.time}Z`) : NaN;
    const value = typeof current?.weather_code === "number" ? weatherValue(current.weather_code, current.precipitation ?? null) : null;
    // A model time far in the future or older than 3 h is not a usable nowcast.
    if (!value || !Number.isFinite(time) || time > now.getTime() + 2_000 || now.getTime() - time > 3 * 3_600_000) { rejected++; return; }
    const detail: Record<string, number> = { weatherCode: current!.weather_code! };
    if (typeof current!.temperature_2m === "number") detail.temperatureC = current!.temperature_2m;
    if (typeof current!.precipitation === "number") detail.precipitationMm = current!.precipitation;
    if (typeof current!.wind_speed_10m === "number") detail.windKmh = current!.wind_speed_10m;
    if (typeof current!.relative_humidity_2m === "number") detail.humidityPct = current!.relative_humidity_2m;
    records.push({ cell: cell.cell, lat: cell.lat, lng: cell.lng, value, time, detail });
  });
  return { records, rejected };
}

export class OpenMeteoAdapter implements SourceAdapter<WeatherRecord> {
  readonly sourceId = "open-meteo";
  readonly windowMs = 15 * 60_000;
  constructor(private readonly endpoint: string, private readonly userAgent: string, private readonly transport: typeof fetch = fetch) {}

  async fetch(scope: IngestionScope, now: Date): Promise<FetchResult<WeatherRecord>> {
    const cells = weatherCells(scope.bbox);
    const url = new URL(this.endpoint);
    url.searchParams.set("latitude", cells.map((c) => c.lat.toFixed(4)).join(","));
    url.searchParams.set("longitude", cells.map((c) => c.lng.toFixed(4)).join(","));
    url.searchParams.set("current", "weather_code,temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m");
    url.searchParams.set("timezone", "GMT");
    const payload = await fetchJson(url.toString(), { method: "GET", headers: { "User-Agent": this.userAgent, Accept: "application/json" }, timeoutMs: 20_000 }, this.transport);
    return normalizeOpenMeteo(payload, cells, now);
  }

  async persist(client: pg.PoolClient, records: WeatherRecord[], runId: string) {
    let upserted = 0;
    const subjectKeys: string[] = [];
    for (const r of records) {
      const res = await client.query(
        `INSERT INTO observations (domain, value, detail, subject_type, geom, source_id, ingestion_run_id, nature, observed_at, valid_until, confidence, dedupe_key)
         VALUES ('WEATHER', $1, $2, 'AREA_CELL', ST_SetSRID(ST_MakePoint($3,$4),4326)::geography, 'open-meteo', $5, 'FORECAST', $6, $7, 0.75, $8)
         ON CONFLICT (source_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
        [r.value, JSON.stringify(r.detail), r.lng, r.lat, runId, new Date(r.time), new Date(r.time + 90 * 60_000), `${r.cell}:${r.time}`]);
      if (res.rowCount) { upserted++; subjectKeys.push(`cell:${r.cell}:WEATHER`); }
    }
    return { upserted, rejected: 0, subjectKeys };
  }
}
