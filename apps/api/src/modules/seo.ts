import { z } from "zod";
import { notFound } from "../http/errors";
import type { Router } from "../http/router";
import { parse } from "../http/validate";
import { CATEGORY_BY_ID, PLACE_CATEGORIES } from "../../../../src/reality/categories";
import { PLACE_SELECT, placeOut } from "./places";
import type { AppDeps } from "./deps";

/**
 * Indexability policy (no thin pages):
 *  - A place is indexable when it has an address and at least two substantive facts among
 *    {published schedule, website/phone, wheelchair info, a published story, verified state history}.
 *  - A category page inside an area is indexable when it lists >= 8 indexable places.
 *  - An area page is indexable when it has >= 20 indexable places.
 *  - Published stories are indexable. Drafts, user pages, journeys, shares and admin never are.
 */
export const INDEXABILITY = { placeMinFacts: 2, categoryMinPlaces: 8, areaMinPlaces: 20 } as const;

const INDEXABLE_PLACE_SQL = `
  p.status = 'active' AND p.address IS NOT NULL AND (
    (p.opening_hours IS NOT NULL)::int + (p.website IS NOT NULL OR p.phone IS NOT NULL)::int + (p.wheelchair IS NOT NULL)::int +
    EXISTS (SELECT 1 FROM stories st WHERE st.place_id = p.id AND st.status = 'PUBLISHED')::int +
    EXISTS (SELECT 1 FROM reports r WHERE r.place_id = p.id AND r.status = 'VERIFIED')::int
  ) >= ${INDEXABILITY.placeMinFacts}`;

export function registerSeoRoutes(router: Router, deps: AppDeps) {
  const { db } = deps;

  router.get("/v1/seo/sitemap", async () => {
    const places = await db.query<{ slug: string; updated_at: Date }>(`SELECT p.slug, p.updated_at FROM places p WHERE ${INDEXABLE_PLACE_SQL} ORDER BY p.updated_at DESC LIMIT 45000`);
    const stories = await db.query<{ slug: string; updated_at: Date }>("SELECT slug, updated_at FROM stories WHERE status = 'PUBLISHED' ORDER BY updated_at DESC LIMIT 5000");
    const areas = await db.query<{ id: string; n: number; latest: Date }>(
      `SELECT a.id, count(p.id)::int AS n, max(p.updated_at) AS latest FROM areas a JOIN places p ON ST_Intersects(p.geom, a.bbox) AND ${INDEXABLE_PLACE_SQL}
        WHERE a.bbox IS NOT NULL GROUP BY a.id`);
    const cats = await db.query<{ area_id: string; category: string; n: number; latest: Date }>(
      `SELECT a.id AS area_id, p.category, count(*)::int AS n, max(p.updated_at) AS latest FROM areas a JOIN places p ON ST_Intersects(p.geom, a.bbox) AND ${INDEXABLE_PLACE_SQL}
        WHERE a.bbox IS NOT NULL GROUP BY a.id, p.category`);
    return { body: {
      places: places.rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at.toISOString() })),
      stories: stories.rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at.toISOString() })),
      areas: areas.rows.filter((a) => a.n >= INDEXABILITY.areaMinPlaces).map((a) => ({ id: a.id, updatedAt: a.latest.toISOString() })),
      categories: cats.rows.filter((c) => c.n >= INDEXABILITY.categoryMinPlaces).map((c) => ({ areaId: c.area_id, category: c.category, updatedAt: c.latest.toISOString() })),
    } };
  }, { cacheSeconds: 600 });

  router.get("/v1/seo/places/:slug", async (ctx) => {
    const { rows } = await db.query<{ indexable: boolean }>(`SELECT (${INDEXABLE_PLACE_SQL}) AS indexable FROM places p WHERE p.slug = $1`, [ctx.params.slug]);
    if (!rows[0]) throw notFound("PLACE_NOT_FOUND");
    return { body: { indexable: rows[0].indexable } };
  }, { cacheSeconds: 600 });

  router.get("/v1/sources", async () => {
    const { rows } = await db.query(`SELECT id, name, kind, domains, license, attribution, commercial_use, update_frequency, data_nature, enabled, notes FROM data_sources ORDER BY enabled DESC, id`);
    return { body: { items: rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, domains: r.domains, license: r.license, attribution: r.attribution,
      commercialUse: r.commercial_use, updateFrequency: r.update_frequency, nature: r.data_nature, enabled: r.enabled, notes: r.notes })) } };
  }, { cacheSeconds: 600 });

  router.get("/v1/areas", async () => {
    const { rows } = await db.query(`SELECT a.id, a.name, a.kind, ST_Y(a.centroid::geometry) AS lat, ST_X(a.centroid::geometry) AS lng,
        ST_XMin(a.bbox::geometry) AS w, ST_YMin(a.bbox::geometry) AS s, ST_XMax(a.bbox::geometry) AS e, ST_YMax(a.bbox::geometry) AS n,
        (SELECT count(*)::int FROM places p WHERE p.status = 'active' AND ST_Intersects(p.geom, a.bbox)) AS place_count
        FROM areas a WHERE a.bbox IS NOT NULL ORDER BY a.name`);
    return { body: { items: rows.map((a) => ({ id: a.id, name: a.name, kind: a.kind, centroid: [a.lng, a.lat], bbox: [a.w, a.s, a.e, a.n], placeCount: a.place_count })) } };
  }, { cacheSeconds: 300 });

  router.get("/v1/areas/:id", async (ctx) => {
    const id = parse(z.string().regex(/^[a-z0-9-]{2,40}$/), ctx.params.id);
    const a = await db.query(`SELECT a.id, a.name, a.kind, a.description, ST_Y(a.centroid::geometry) AS lat, ST_X(a.centroid::geometry) AS lng,
        ST_XMin(a.bbox::geometry) AS w, ST_YMin(a.bbox::geometry) AS s, ST_XMax(a.bbox::geometry) AS e, ST_YMax(a.bbox::geometry) AS n FROM areas a WHERE a.id = $1 AND a.bbox IS NOT NULL`, [id]);
    const area = a.rows[0];
    if (!area) throw notFound("AREA_NOT_FOUND");
    const counts = await db.query<{ category: string; n: number; indexable: number }>(
      `SELECT p.category, count(*)::int AS n, count(*) FILTER (WHERE ${INDEXABLE_PLACE_SQL})::int AS indexable FROM places p, areas a
        WHERE a.id = $1 AND p.status = 'active' AND ST_Intersects(p.geom, a.bbox) GROUP BY p.category`, [id]);
    const featured = await db.query(`${PLACE_SELECT} FROM places p JOIN data_sources s ON s.id = p.source_id, areas a
        WHERE a.id = $1 AND ST_Intersects(p.geom, a.bbox) AND ${INDEXABLE_PLACE_SQL} ORDER BY p.updated_at DESC, p.id LIMIT 12`, [id]);
    const indexableTotal = counts.rows.reduce((s, r) => s + r.indexable, 0);
    return { body: {
      area: { id: area.id, name: area.name, kind: area.kind, description: area.description, centroid: [area.lng, area.lat], bbox: [area.w, area.s, area.e, area.n] },
      categories: PLACE_CATEGORIES.map((c) => { const r = counts.rows.find((x) => x.category === c.id); return { id: c.id, label: c.label, placeCount: r?.n ?? 0, indexable: (r?.indexable ?? 0) >= INDEXABILITY.categoryMinPlaces }; }),
      featuredPlaces: featured.rows.map(placeOut),
      indexable: indexableTotal >= INDEXABILITY.areaMinPlaces,
    } };
  }, { cacheSeconds: 300 });

  router.get("/v1/areas/:id/categories/:category", async (ctx) => {
    const id = parse(z.string().regex(/^[a-z0-9-]{2,40}$/), ctx.params.id);
    const category = parse(z.string().regex(/^[a-z_]{2,32}$/), ctx.params.category);
    if (!CATEGORY_BY_ID.has(category)) throw notFound("CATEGORY_NOT_FOUND");
    const area = await db.query<{ name: string }>("SELECT name FROM areas WHERE id = $1 AND bbox IS NOT NULL", [id]);
    if (!area.rows[0]) throw notFound("AREA_NOT_FOUND");
    const { rows } = await db.query(`${PLACE_SELECT}, (${INDEXABLE_PLACE_SQL}) AS indexable FROM places p JOIN data_sources s ON s.id = p.source_id, areas a
        WHERE a.id = $1 AND p.category = $2 AND p.status = 'active' AND ST_Intersects(p.geom, a.bbox) ORDER BY (${INDEXABLE_PLACE_SQL}) DESC, p.name LIMIT 100`, [id, category]);
    const indexableCount = rows.filter((r) => r.indexable).length;
    return { body: { area: { id, name: area.rows[0].name }, category: { id: category, label: CATEGORY_BY_ID.get(category)!.label },
      places: rows.map(placeOut), indexable: indexableCount >= INDEXABILITY.categoryMinPlaces } };
  }, { cacheSeconds: 300 });
}
