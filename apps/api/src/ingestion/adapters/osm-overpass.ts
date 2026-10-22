import type pg from "pg";
import { fetchJson, PermanentError } from "../../lib/resilience";
import { slugify } from "../../lib/slug";
import { CATEGORY_BY_ID, categoryForOsmTags, PLACE_CATEGORIES } from "../../../../../src/reality/categories";
import type { FetchResult, IngestionScope, SourceAdapter } from "../framework";

export type OsmPlace = {
  ref: string; name: string; category: string; lat: number; lng: number; address: string | null;
  openingHours: string | null; website: string | null; phone: string | null; wheelchair: "yes" | "limited" | "no" | null;
  tags: Record<string, string>;
};

type OsmElement = { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

export function buildOverpassQuery(scope: IngestionScope): string {
  const cats = scope.categories?.length ? scope.categories.map((c) => CATEGORY_BY_ID.get(c)).filter(Boolean) : PLACE_CATEGORIES;
  const { south, west, north, east } = scope.bbox;
  const box = `(${south},${west},${north},${east})`;
  const parts = cats.flatMap((c) => c!.osm.map((sel) => {
    const [k, v] = sel.split("=");
    return `nwr["${k}"="${v}"]["name"]${box};`;
  }));
  return `[out:json][timeout:90];(${parts.join("")});out center tags;`;
}

const KEEP_TAGS = ["cuisine", "operator", "brand", "fee", "access", "capacity", "denomination", "religion", "heritage", "wikidata", "name:en", "name:vi"];
const safeUrl = (v: string | undefined) => (v && /^https?:\/\/[^\s]{3,300}$/.test(v) ? v : null);

/** Normalize Overpass JSON. Elements without a name, category or valid coordinates are rejected (counted). */
export function normalizeOverpass(payload: unknown): FetchResult<OsmPlace> {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { elements?: unknown }).elements)) throw new PermanentError("INVALID_OVERPASS_PAYLOAD");
  const elements = (payload as { elements: OsmElement[] }).elements;
  const seen = new Set<string>();
  const records: OsmPlace[] = [];
  let rejected = 0;
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = (tags["name:vi"] ?? tags.name ?? "").trim();
    const category = categoryForOsmTags(tags);
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    const ref = `${el.type}/${el.id}`;
    if (!name || name.length > 240 || !category || typeof lat !== "number" || typeof lng !== "number" ||
        !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || seen.has(ref)) { rejected++; continue; }
    seen.add(ref);
    const addr = [tags["addr:housenumber"], tags["addr:street"], tags["addr:subdistrict"] ?? tags["addr:quarter"], tags["addr:district"], tags["addr:city"]]
      .filter((x) => x && x.trim()).join(", ");
    const wc = tags.wheelchair;
    records.push({
      ref, name, category, lat, lng,
      address: addr || tags["addr:full"] || null,
      openingHours: tags.opening_hours?.slice(0, 255) ?? null,
      website: safeUrl(tags.website ?? tags["contact:website"]),
      phone: (tags.phone ?? tags["contact:phone"])?.slice(0, 40) ?? null,
      wheelchair: wc === "yes" || wc === "limited" || wc === "no" ? wc : null,
      tags: Object.fromEntries(KEEP_TAGS.filter((k) => tags[k]).map((k) => [k, tags[k]!.slice(0, 200)])),
    });
  }
  return { records, rejected };
}

export class OverpassAdapter implements SourceAdapter<OsmPlace> {
  readonly sourceId = "osm-overpass";
  readonly windowMs = 24 * 3_600_000;
  constructor(private readonly endpoint: string, private readonly userAgent: string, private readonly transport: typeof fetch = fetch) {}

  async fetch(scope: IngestionScope): Promise<FetchResult<OsmPlace>> {
    const payload = await fetchJson(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": this.userAgent, Accept: "application/json" },
      body: new URLSearchParams({ data: buildOverpassQuery(scope) }).toString(),
      timeoutMs: 120_000,
      maxBytes: 50 * 1024 * 1024,
    }, this.transport);
    return normalizeOverpass(payload);
  }

  async persist(client: pg.PoolClient, records: OsmPlace[], runId: string, scope: IngestionScope, now: Date) {
    let upserted = 0;
    for (const r of records) {
      const slug = `${slugify(r.name)}-${r.ref.replace("/", "-").replace(/^node-/, "n").replace(/^way-/, "w").replace(/^relation-/, "r")}`;
      const res = await client.query(
        `INSERT INTO places (slug, name, category, address, geom, area_id, opening_hours, website, phone, wheelchair, tags, source_id, source_ref, ingestion_run_id, source_updated_at, status, updated_at)
         VALUES ($1,$2,$3,$4, ST_SetSRID(ST_MakePoint($5,$6),4326)::geography, (SELECT id FROM areas WHERE id = $7), $8,$9,$10,$11,$12,'osm-overpass',$13,$14,$15,'active', now())
         ON CONFLICT (source_id, source_ref) DO UPDATE SET
           name = EXCLUDED.name, category = EXCLUDED.category, address = EXCLUDED.address, geom = EXCLUDED.geom,
           opening_hours = EXCLUDED.opening_hours, website = EXCLUDED.website, phone = EXCLUDED.phone, wheelchair = EXCLUDED.wheelchair,
           tags = EXCLUDED.tags, ingestion_run_id = EXCLUDED.ingestion_run_id, source_updated_at = EXCLUDED.source_updated_at,
           area_id = COALESCE(EXCLUDED.area_id, places.area_id),
           status = CASE WHEN places.status = 'hidden' THEN 'hidden' ELSE 'active' END, updated_at = now()`,
        [slug, r.name, r.category, r.address, r.lng, r.lat, scope.regionId, r.openingHours, r.website, r.phone, r.wheelchair, JSON.stringify(r.tags), r.ref, runId, now]);
      upserted += res.rowCount ?? 0;
    }
    // Places no longer present upstream inside the fully-ingested scope are retired, not deleted.
    const cats = scope.categories?.length ? scope.categories : PLACE_CATEGORIES.map((c) => c.id);
    await client.query(
      `UPDATE places SET status = 'removed', updated_at = now()
        WHERE source_id = 'osm-overpass' AND status = 'active' AND category = ANY($1) AND ingestion_run_id IS DISTINCT FROM $2
          AND geom && ST_MakeEnvelope($3,$4,$5,$6,4326)::geography`,
      [cats, runId, scope.bbox.west, scope.bbox.south, scope.bbox.east, scope.bbox.north]);
    return { upserted, rejected: 0, subjectKeys: [] };
  }
}
