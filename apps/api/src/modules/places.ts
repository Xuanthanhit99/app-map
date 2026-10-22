import { z } from "zod";
import type { Queryable } from "../db/pool";
import { badRequest, notFound } from "../http/errors";
import type { Router } from "../http/router";
import { parse, queryObject } from "../http/validate";
import { parseBBox } from "../lib/geo";
import { CATEGORY_BY_ID, PLACE_CATEGORIES } from "../../../../src/reality/categories";
import { REALITY_DOMAINS, type RealityDomain } from "../../../../src/reality/catalog";
import { evaluatePlace, statesInBBox, type PublicState } from "./reality/repository";
import type { AppDeps } from "./deps";

export type PlaceOut = {
  id: string; slug: string; name: string; category: string; categoryLabel: string; address: string | null;
  coordinate: [number, number]; areaId: string | null;
  openingHours: { raw: string; note: string } | null;
  website: string | null; phone: string | null; wheelchair: string | null;
  source: { id: string; name: string; attribution: string; license: string };
  sourceUpdatedAt: string | null; updatedAt: string;
  distanceMeters?: number;
};

export const PLACE_SELECT = `
  SELECT p.id, p.slug, p.name, p.category, p.address, ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lng,
         p.area_id, p.opening_hours, p.website, p.phone, p.wheelchair, p.source_updated_at, p.updated_at,
         s.id AS source_id, s.name AS source_name, s.attribution, s.license`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function placeOut(r: any): PlaceOut {
  return {
    id: r.id, slug: r.slug, name: r.name, category: r.category, categoryLabel: CATEGORY_BY_ID.get(r.category)?.label ?? r.category,
    address: r.address, coordinate: [r.lng, r.lat], areaId: r.area_id,
    // OSM opening_hours is a published schedule, not a live observation: never presented as "open now".
    openingHours: r.opening_hours ? { raw: r.opening_hours, note: "Lịch mở cửa đã công bố (OpenStreetMap), không phải trạng thái trực tiếp." } : null,
    website: r.website, phone: r.phone, wheelchair: r.wheelchair,
    source: { id: r.source_id, name: r.source_name, attribution: r.attribution, license: r.license },
    sourceUpdatedAt: r.source_updated_at ? r.source_updated_at.toISOString() : null,
    updatedAt: r.updated_at.toISOString(),
    ...(r.distance_m !== undefined && r.distance_m !== null ? { distanceMeters: Math.round(r.distance_m) } : {}),
  };
}

const latLng = z.string().regex(/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/).transform((s) => {
  const [lat, lng] = s.split(",").map(Number) as [number, number];
  return { lat, lng };
}).refine((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180, "out of range");

export const listSchema = z.object({
  q: z.string().trim().min(2).max(120).optional(),
  category: z.string().regex(/^[a-z_]{2,32}$/).optional(),
  near: latLng.optional(),
  radius: z.coerce.number().int().min(50).max(20_000).default(3000),
  bbox: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().regex(/^\d{1,4}$/).optional(),
}).strict();

export async function findPlace(q: Queryable, idOrSlug: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const { rows } = await q.query(`${PLACE_SELECT} FROM places p JOIN data_sources s ON s.id = p.source_id
    WHERE p.status = 'active' AND ${isUuid ? "p.id = $1" : "p.slug = $1"}`, [idOrSlug]);
  return rows[0] ? placeOut(rows[0]) : null;
}

export async function listPlaces(q: Queryable, input: z.infer<typeof listSchema>) {
  const where: string[] = ["p.status = 'active'"];
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (input.category) {
    if (!CATEGORY_BY_ID.has(input.category)) throw badRequest("UNKNOWN_CATEGORY");
    where.push(`p.category = ${p(input.category)}`);
  }
  let distance = "NULL::float8";
  let order = "p.name ASC";
  if (input.near) {
    const pt = `ST_SetSRID(ST_MakePoint(${p(input.near.lng)}, ${p(input.near.lat)}), 4326)::geography`;
    where.push(`ST_DWithin(p.geom, ${pt}, ${p(input.radius)})`);
    distance = `ST_Distance(p.geom, ${pt})`;
    order = "distance_m ASC";
  }
  if (input.bbox) {
    const bbox = parseBBox(input.bbox, 2);
    if (!bbox) throw badRequest("INVALID_BBOX");
    where.push(`p.geom && ST_MakeEnvelope(${p(bbox.west)}, ${p(bbox.south)}, ${p(bbox.east)}, ${p(bbox.north)}, 4326)::geography`);
  }
  if (input.q) {
    const term = p(input.q);
    where.push(`(reality_fold(p.name) % reality_fold(${term}) OR reality_fold(p.name) LIKE '%' || reality_fold(${term}) || '%')`);
    if (!input.near) order = `similarity(reality_fold(p.name), reality_fold(${term})) DESC, p.name ASC`;
  }
  if (!input.q && !input.near && !input.bbox && !input.category) throw badRequest("FILTER_REQUIRED");
  const offset = Number(input.cursor ?? 0);
  if (offset > 1000) throw badRequest("CURSOR_OUT_OF_RANGE");
  const { rows } = await q.query(
    `${PLACE_SELECT}, ${distance} AS distance_m FROM places p JOIN data_sources s ON s.id = p.source_id
      WHERE ${where.join(" AND ")} ORDER BY ${order}, p.id LIMIT ${p(input.limit + 1)} OFFSET ${p(offset)}`, params);
  const items = rows.slice(0, input.limit).map(placeOut);
  return { items, nextCursor: rows.length > input.limit ? String(offset + input.limit) : null };
}

export function registerPlaceRoutes(router: Router, deps: AppDeps) {
  const { db } = deps;
  router.get("/v1/places", async (ctx) => ({ body: await listPlaces(db, parse(listSchema, queryObject(ctx.query))) }));

  router.get("/v1/places/categories", async () => {
    const { rows } = await db.query<{ category: string; n: number }>("SELECT category, count(*)::int AS n FROM places WHERE status = 'active' GROUP BY category");
    const counts = new Map(rows.map((r) => [r.category, r.n]));
    return { body: { items: PLACE_CATEGORIES.map((c) => ({ id: c.id, label: c.label, placeCount: counts.get(c.id) ?? 0 })) } };
  }, { cacheSeconds: 300 });

  router.get("/v1/places/:idOrSlug", async (ctx) => {
    const place = await findPlace(db, ctx.params.idOrSlug!);
    if (!place) throw notFound("PLACE_NOT_FOUND");
    const now = deps.now();
    const states = await evaluatePlace(db, place.id, now);
    const stories = await db.query(
      `SELECT id, slug, title, summary, published_at FROM stories WHERE place_id = $1 AND status = 'PUBLISHED' ORDER BY published_at DESC LIMIT 5`, [place.id]);
    const reports = await db.query(
      `SELECT id, domain, value, status, observed_at FROM reports
        WHERE place_id = $1 AND status IN ('PENDING','CORROBORATED','VERIFIED','DISPUTED') AND held_for_review = false AND expires_at > $2
        ORDER BY observed_at DESC LIMIT 20`, [place.id, now]);
    let saved = false;
    if (ctx.user) saved = Boolean((await db.query("SELECT 1 FROM saved_places WHERE user_id = $1 AND place_id = $2", [ctx.user.id, place.id])).rowCount);
    return { body: {
      place, states, saved,
      stories: stories.rows.map((s) => ({ id: s.id, slug: s.slug, title: s.title, summary: s.summary, publishedAt: s.published_at?.toISOString() ?? null })),
      recentReports: reports.rows.map((r) => ({ id: r.id, domain: r.domain, value: r.value, status: r.status, observedAt: r.observed_at.toISOString() })),
      evaluatedAt: now.toISOString(),
    } };
  }, { auth: "optional" });

  const stateQuery = z.object({
    bbox: z.string().max(100),
    domains: z.string().max(100).optional(),
  }).strict();
  router.get("/v1/reality/states", async (ctx) => {
    const input = parse(stateQuery, queryObject(ctx.query));
    const bbox = parseBBox(input.bbox, 1);
    if (!bbox) throw badRequest("INVALID_BBOX");
    const domains = (input.domains?.split(",") ?? ["ROAD", "WEATHER", "ACTIVITY"]) as RealityDomain[];
    if (!domains.every((d) => REALITY_DOMAINS.includes(d))) throw badRequest("UNKNOWN_DOMAIN");
    const now = deps.now();
    const items: PublicState[] = await statesInBBox(db, bbox, now, domains);
    return { body: { status: items.length ? "ready" : "empty", items, ...(items.length ? {} : { reason: "NO_ACTIVE_EVIDENCE" }), evaluatedAt: now.toISOString() } };
  });
}
