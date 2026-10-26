import type { Queryable } from "../db/pool";
import { parseBBox, type BBox } from "../lib/geo";

export type CoverageRegion = { id: string; name: string; bbox: BBox };

/** Default: central Hà Nội (Hoàn Kiếm, Ba Đình, Đống Đa, Hai Bà Trưng, Tây Hồ, Cầu Giấy). */
export const DEFAULT_REGIONS = "ha-noi|Hà Nội (nội thành)|105.78,20.98,105.88,21.08";

export function parseRegions(value = process.env.COVERAGE_REGIONS ?? DEFAULT_REGIONS): CoverageRegion[] {
  return value.split(";").map((s) => s.trim()).filter(Boolean).map((entry) => {
    const [id, name, bbox] = entry.split("|");
    const b = parseBBox(bbox ?? "", 0.5);
    if (!id || !/^[a-z0-9-]{2,40}$/.test(id) || !name || !b) throw new Error("INVALID_COVERAGE_REGIONS");
    return { id, name, bbox: b };
  });
}

export async function upsertRegions(q: Queryable, regions: CoverageRegion[]): Promise<void> {
  for (const r of regions) {
    await q.query(
      `INSERT INTO areas (id, name, kind, centroid, bbox, defined_by)
       VALUES ($1, $2, 'CITY', ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, ST_MakeEnvelope($5,$6,$7,$8,4326)::geography, 'COVERAGE_CONFIG')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, centroid = EXCLUDED.centroid, bbox = EXCLUDED.bbox`,
      [r.id, r.name, (r.bbox.west + r.bbox.east) / 2, (r.bbox.south + r.bbox.north) / 2, r.bbox.west, r.bbox.south, r.bbox.east, r.bbox.north]);
  }
}
