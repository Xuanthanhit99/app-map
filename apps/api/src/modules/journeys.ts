import { z } from "zod";
import { withTransaction } from "../db/pool";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../http/errors";
import type { AuthUser, Router } from "../http/router";
import { parse } from "../http/validate";
import { randomToken, sha256 } from "../lib/crypto";
import { haversineMeters } from "../lib/geo";
import { routeThroughGateway } from "../routing-gateway";
import { DOMAIN_CATALOG, SEVERITY_RANK, severityOf, type ImpactSeverity, type RealityDomain } from "../../../../src/reality/catalog";
import { hasConsent } from "./account";
import { audit } from "./audit";
import { evaluateSubject } from "./reality/repository";
import type { AppDeps } from "./deps";

/**
 * Journey Engine. Persists endpoints and the provider route summary only — never GPS traces.
 * Positions sent with events are used transiently (arrival/deviation checks) and discarded.
 */
export const JOURNEY_POLICY = {
  routeMaxAgeForStartMs: 15 * 60_000,
  arrivalRadiusM: 60,
  maxPositionAccuracyM: 100,
  offRouteThresholdM: 80,
  impactCorridorM: 300,
  shareMaxTtlMinutes: 240,
} as const;

const point = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict();
export const createSchema = z.object({
  origin: point,
  destination: point.optional(),
  destinationPlaceId: z.string().uuid().optional(),
  destinationLabel: z.string().trim().max(120).optional(),
  mode: z.enum(["DRIVING", "WALKING", "CYCLING"]).default("DRIVING"),
}).strict();
export const eventSchema = z.object({
  type: z.enum(["START", "PAUSE", "RESUME", "ARRIVE", "CANCEL", "STOP", "POSITION"]),
  position: point.extend({ accuracyMeters: z.number().min(0).max(5000), observedAt: z.string().datetime() }).optional(),
}).strict();

type JourneyRow = {
  id: string; user_id: string; status: string; mode: string; o_lat: number; o_lng: number; d_lat: number; d_lng: number;
  destination_place_id: string | null; destination_label: string | null; route: { coordinates: [number, number][] } | null;
  route_provider: string | null; distance_m: number | null; duration_s: number | null; route_revision: number;
  started_at: Date | null; ended_at: Date | null; created_at: Date; updated_at: Date;
};
const SELECT = `SELECT j.*, ST_Y(origin::geometry) AS o_lat, ST_X(origin::geometry) AS o_lng, ST_Y(destination::geometry) AS d_lat, ST_X(destination::geometry) AS d_lng,
  ST_AsGeoJSON(route_geom)::json AS route FROM journeys j`;

function journeyOut(j: JourneyRow, now: Date) {
  const routeAgeMs = now.getTime() - j.updated_at.getTime();
  return {
    id: j.id, status: j.status, mode: j.mode,
    origin: [j.o_lng, j.o_lat], destination: [j.d_lng, j.d_lat], destinationPlaceId: j.destination_place_id, destinationLabel: j.destination_label,
    route: j.route ? { provider: j.route_provider, revision: j.route_revision, distanceMeters: j.distance_m, durationSeconds: j.duration_s,
      durationLabel: "Ước tính của nhà cung cấp định tuyến", coordinates: j.route.coordinates } : null,
    routeStatus: j.route ? "AVAILABLE" : "UNAVAILABLE",
    canStart: j.status === "PLANNED" && Boolean(j.route) && routeAgeMs <= JOURNEY_POLICY.routeMaxAgeForStartMs,
    startedAt: j.started_at?.toISOString() ?? null, endedAt: j.ended_at?.toISOString() ?? null, createdAt: j.created_at.toISOString(),
  };
}

const TRANSITIONS: Record<string, string[]> = {
  START: ["PLANNED"], PAUSE: ["ACTIVE"], RESUME: ["PAUSED"], ARRIVE: ["ACTIVE", "PAUSED"], CANCEL: ["PLANNED", "ACTIVE", "PAUSED"], STOP: ["ACTIVE", "PAUSED"], POSITION: ["ACTIVE"],
};
const NEXT: Record<string, string> = { START: "ACTIVE", PAUSE: "PAUSED", RESUME: "ACTIVE", ARRIVE: "ARRIVED", CANCEL: "CANCELLED", STOP: "STOPPED" };

/** Distance in metres from a point to a polyline ([lng,lat]) using a local equirectangular projection. */
export function distanceToRoute(p: { lat: number; lng: number }, coords: [number, number][]): number {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111_320;
  const toXY = ([lng, lat]: [number, number]) => [(lng - p.lng) * k, (lat - p.lat) * 110_540] as const;
  let best = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const [ax, ay] = toXY(coords[i]!), [bx, by] = toXY(coords[i + 1]!);
    const dx = bx - ax, dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return coords.length === 1 ? haversineMeters(p, { lat: coords[0]![1], lng: coords[0]![0] }) : best;
}

export function createJourneyService(deps: AppDeps) {
  const { db } = deps;

  async function load(user: AuthUser, id: string): Promise<JourneyRow> {
    const { rows } = await db.query<JourneyRow>(`${SELECT} WHERE j.id = $1`, [id]);
    const j = rows[0];
    // Object ownership is enforced on the server; other users' journeys are indistinguishable from missing ones.
    if (!j || j.user_id !== user.id) throw notFound("JOURNEY_NOT_FOUND");
    return j;
  }

  async function route(origin: z.infer<typeof point>, dest: { latitude: number; longitude: number }, mode: "DRIVING" | "WALKING" | "CYCLING") {
    if (!deps.routing) return null;
    const result = await routeThroughGateway({ primary: deps.routing, timeoutMs: 8_000 }, { origin: [origin.longitude, origin.latitude], destination: [dest.longitude, dest.latitude], mode });
    return result.status === "SUCCESS" ? result : { failure: result.reason };
  }

  async function create(user: AuthUser, input: z.infer<typeof createSchema>, requestId: string) {
    let dest = input.destination;
    let label = input.destinationLabel ?? null;
    if (input.destinationPlaceId) {
      const p = await db.query<{ lat: number; lng: number; name: string }>("SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng, name FROM places WHERE id = $1 AND status = 'active'", [input.destinationPlaceId]);
      if (!p.rows[0]) throw notFound("PLACE_NOT_FOUND");
      dest = { latitude: p.rows[0].lat, longitude: p.rows[0].lng };
      label ??= p.rows[0].name;
    }
    if (!dest) throw badRequest("DESTINATION_REQUIRED");
    if (haversineMeters({ lat: input.origin.latitude, lng: input.origin.longitude }, { lat: dest.latitude, lng: dest.longitude }) < 30) throw badRequest("ORIGIN_EQUALS_DESTINATION");
    const r = await route(input.origin, dest, input.mode);
    const ok = r && !("failure" in r) ? r : null;
    const active = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM journeys WHERE user_id = $1 AND status IN ('PLANNED','ACTIVE','PAUSED')", [user.id]);
    if ((active.rows[0]?.n ?? 0) >= 5) throw conflict("TOO_MANY_OPEN_JOURNEYS");
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO journeys (user_id, status, mode, origin, destination, destination_place_id, destination_label, route_geom, route_provider, distance_m, duration_s, created_at, updated_at)
       VALUES ($1,'PLANNED',$2, ST_SetSRID(ST_MakePoint($3,$4),4326)::geography, ST_SetSRID(ST_MakePoint($5,$6),4326)::geography, $7, $8,
               CASE WHEN $9::text IS NULL THEN NULL ELSE ST_GeomFromGeoJSON($9)::geography END, $10, $11, $12, $13, $13) RETURNING id`,
      [user.id, input.mode, input.origin.longitude, input.origin.latitude, dest.longitude, dest.latitude, input.destinationPlaceId ?? null, label,
        ok ? JSON.stringify({ type: "LineString", coordinates: ok.route.coordinates }) : null, ok?.provider ?? null,
        ok ? Math.round(ok.distanceMeters) : null, ok ? Math.round(ok.durationSeconds) : null, deps.now()]);
    await db.query("INSERT INTO journey_events (journey_id, type, detail) VALUES ($1,'PLANNED',$2)", [rows[0]!.id, JSON.stringify({ routeStatus: ok ? "AVAILABLE" : "UNAVAILABLE", ...(r && "failure" in r ? { failure: r.failure } : {}), ...(!deps.routing ? { failure: "ROUTING_PROVIDER_NOT_CONFIGURED" } : {}) })]);
    await audit(db, { actor: user, action: "journey.created", targetType: "JOURNEY", targetId: rows[0]!.id, requestId });
    const j = await load(user, rows[0]!.id);
    return { journey: journeyOut(j, deps.now()), routing: ok ? "OK" : !deps.routing ? "ROUTING_PROVIDER_NOT_CONFIGURED" : (r as { failure: string }).failure };
  }

  async function impact(j: JourneyRow) {
    if (!j.route) return { status: "UNAVAILABLE" as const, items: [] };
    const now = deps.now();
    // Subjects with a current snapshot near the route corridor, then re-evaluated live (snapshots are only a spatial index).
    const { rows } = await db.query<{ subject_key: string }>(
      `SELECT DISTINCT ON (subject_key) subject_key FROM reality_state_snapshots
        WHERE evaluated_at > $2::timestamptz - interval '24 hours' AND domain = ANY($3)
          AND ST_DWithin(geom, (SELECT route_geom FROM journeys WHERE id = $1), $4)
        ORDER BY subject_key, evaluated_at DESC`, [j.id, now, ["ROAD", "WEATHER", "ACTIVITY"], JOURNEY_POLICY.impactCorridorM]);
    const incidents = await db.query<{ id: string; title: string; severity: ImpactSeverity }>(
      `SELECT id, title, severity FROM incidents WHERE status <> 'RESOLVED' AND geom IS NOT NULL
         AND ST_DWithin(geom, (SELECT route_geom FROM journeys WHERE id = $1), radius_m + $2)`, [j.id, JOURNEY_POLICY.impactCorridorM]);
    const items = [];
    for (const r of rows) {
      const ev = await evaluateSubject(db, r.subject_key, now);
      if (!ev || (ev.state.truth === "UNKNOWN" && !ev.state.signals.length)) continue;
      const severity = severityOf({ truth: ev.state.truth, safety: ev.state.safety, domain: ev.state.domain as RealityDomain, value: ev.state.value });
      items.push({ kind: "STATE" as const, severity, subjectKey: r.subject_key, domain: ev.state.domain, truth: ev.state.truth, value: ev.state.value,
        label: ev.state.label ?? (ev.state.truth === "CONFLICT" ? "Thông tin đang mâu thuẫn" : `${DOMAIN_CATALOG[ev.state.domain as RealityDomain].label}: có báo cáo chưa xác minh`),
        freshness: ev.state.freshness, confidence: ev.state.confidence, sources: ev.state.sources, observedAt: ev.state.observedAt,
        distanceFromRouteMeters: Math.round(distanceToRoute({ lat: ev.lat, lng: ev.lng }, j.route.coordinates)), coordinate: [ev.lng, ev.lat] });
    }
    for (const inc of incidents.rows) items.push({ kind: "INCIDENT" as const, severity: inc.severity, id: inc.id, label: inc.title, truth: "KNOWN" as const });
    items.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    const worst = items[0]?.severity ?? "INFO";
    return {
      status: "EVALUATED" as const,
      worstSeverity: items.length ? worst : null,
      recommendation: worst === "SAFETY_CRITICAL" ? "REROUTE_OR_POSTPONE" : worst === "SIGNIFICANT" ? "CONSIDER_REROUTE" : worst === "MINOR" ? "PROCEED_WITH_CAUTION" : "NO_VERIFIED_IMPACT",
      note: "Không có tác động đã xác minh không đồng nghĩa với tuyến đường an toàn.",
      items, evaluatedAt: now.toISOString(),
    };
  }

  async function event(user: AuthUser, id: string, input: z.infer<typeof eventSchema>, requestId: string) {
    const now = deps.now();
    return withTransaction(db, async (client) => {
      const { rows } = await client.query<JourneyRow>(`${SELECT} WHERE j.id = $1 FOR UPDATE OF j`, [id]);
      const j = rows[0];
      if (!j || j.user_id !== user.id) throw notFound("JOURNEY_NOT_FOUND");
      if (!TRANSITIONS[input.type]!.includes(j.status)) throw conflict("INVALID_JOURNEY_TRANSITION");
      const detail: Record<string, unknown> = {};
      let next = NEXT[input.type] ?? j.status;
      if (input.type === "START") {
        if (!j.route) throw new ApiError(409, "ROUTE_UNAVAILABLE");
        if (now.getTime() - j.updated_at.getTime() > JOURNEY_POLICY.routeMaxAgeForStartMs) throw new ApiError(409, "ROUTE_STALE");
      }
      if (input.position) {
        const pos = input.position;
        const age = now.getTime() - Date.parse(pos.observedAt);
        // Same GPS display policy as the client: <= 2 s future skew, <= 30 s age, bounded accuracy.
        if (age < -2_000 || age > 30_000 || pos.accuracyMeters > JOURNEY_POLICY.maxPositionAccuracyM) {
          detail.position = "REJECTED_QUALITY";
        } else {
          const p = { lat: pos.latitude, lng: pos.longitude };
          const toDest = haversineMeters(p, { lat: j.d_lat, lng: j.d_lng });
          detail.distanceToDestinationM = Math.round(toDest);
          if (toDest <= JOURNEY_POLICY.arrivalRadiusM + Math.min(pos.accuracyMeters, 40)) detail.arrivalDetected = true;
          if (j.route) {
            const off = distanceToRoute(p, j.route.coordinates);
            detail.offRoute = off > JOURNEY_POLICY.offRouteThresholdM + Math.min(pos.accuracyMeters, 40);
          }
        }
      }
      if (input.type === "ARRIVE" && !detail.arrivalDetected && input.position) detail.arrivalUnconfirmedByPosition = true;
      if (input.type === "POSITION") next = j.status;
      await client.query(
        `UPDATE journeys SET status = $2, started_at = CASE WHEN $3 = 'START' THEN $4 ELSE started_at END,
           ended_at = CASE WHEN $2 IN ('ARRIVED','CANCELLED','STOPPED') THEN $4 ELSE ended_at END WHERE id = $1`,
        [id, next, input.type, now]);
      // Only the derived flags are stored, never the coordinates.
      if (input.type !== "POSITION") await client.query("INSERT INTO journey_events (journey_id, type, detail) VALUES ($1,$2,$3)", [id, input.type, JSON.stringify(detail)]);
      if (["ARRIVED", "CANCELLED", "STOPPED"].includes(next)) await client.query("UPDATE journey_shares SET revoked_at = now() WHERE journey_id = $1 AND revoked_at IS NULL", [id]);
      if (input.type !== "POSITION") await audit(client, { actor: user, action: `journey.${input.type.toLowerCase()}`, targetType: "JOURNEY", targetId: id, requestId });
      const fresh = await client.query<JourneyRow>(`${SELECT} WHERE j.id = $1`, [id]);
      return { journey: journeyOut(fresh.rows[0]!, now), checks: detail };
    });
  }

  async function reroute(user: AuthUser, id: string, origin: z.infer<typeof point>, requestId: string) {
    const j = await load(user, id);
    if (!["PLANNED", "ACTIVE", "PAUSED"].includes(j.status)) throw conflict("INVALID_JOURNEY_TRANSITION");
    const r = await route(origin, { latitude: j.d_lat, longitude: j.d_lng }, j.mode as "DRIVING");
    if (!r) throw new ApiError(503, "ROUTING_PROVIDER_NOT_CONFIGURED");
    // A failed reroute keeps the previous route; navigation never jumps to an unvalidated geometry.
    if ("failure" in r) {
      await db.query("INSERT INTO journey_events (journey_id, type, detail) VALUES ($1,'REROUTE_FAILED',$2)", [id, JSON.stringify({ reason: r.failure })]);
      throw new ApiError(502, `REROUTE_FAILED_${r.failure}`);
    }
    await db.query(
      `UPDATE journeys SET origin = ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, route_geom = ST_GeomFromGeoJSON($4)::geography,
         route_provider = $5, distance_m = $6, duration_s = $7, route_revision = route_revision + 1, updated_at = $8 WHERE id = $1`,
      [id, origin.longitude, origin.latitude, JSON.stringify({ type: "LineString", coordinates: r.route.coordinates }), r.provider, Math.round(r.distanceMeters), Math.round(r.durationSeconds), deps.now()]);
    await db.query("INSERT INTO journey_events (journey_id, type, detail) VALUES ($1,'REROUTED',$2)", [id, JSON.stringify({ revision: j.route_revision + 1 })]);
    await audit(db, { actor: user, action: "journey.rerouted", targetType: "JOURNEY", targetId: id, requestId });
    return journeyOut(await load(user, id), deps.now());
  }

  return { load, create, impact, event, reroute, journeyOut };
}

export function registerJourneyRoutes(router: Router, deps: AppDeps) {
  const svc = createJourneyService(deps);
  const { db } = deps;
  const id = (v: string | undefined) => parse(z.string().uuid(), v);

  router.post("/v1/journeys", async (ctx) => ({ status: 201, body: await svc.create(ctx.user!, parse(createSchema, ctx.body), ctx.requestId) }),
    { auth: "user", rateLimit: { name: "journey-create", limit: 20, windowMs: 3_600_000 } });
  router.get("/v1/journeys", async (ctx) => {
    const { rows } = await db.query(`${SELECT} WHERE j.user_id = $1 ORDER BY j.created_at DESC LIMIT 50`, [ctx.user!.id]);
    return { body: { items: rows.map((j) => { const o = svc.journeyOut(j, deps.now()); return { ...o, route: o.route ? { ...o.route, coordinates: [] } : null }; }) } };
  }, { auth: "user" });
  router.get("/v1/journeys/:id", async (ctx) => {
    const j = await svc.load(ctx.user!, id(ctx.params.id));
    const events = await db.query("SELECT type, detail, created_at FROM journey_events WHERE journey_id = $1 ORDER BY id", [j.id]);
    return { body: { journey: svc.journeyOut(j, deps.now()), impact: await svc.impact(j), events: events.rows } };
  }, { auth: "user" });
  router.get("/v1/journeys/:id/impact", async (ctx) => ({ body: await svc.impact(await svc.load(ctx.user!, id(ctx.params.id))) }), { auth: "user" });
  router.post("/v1/journeys/:id/events", async (ctx) => ({ body: await svc.event(ctx.user!, id(ctx.params.id), parse(eventSchema, ctx.body), ctx.requestId) }),
    { auth: "user", rateLimit: { name: "journey-event", limit: 240, windowMs: 3_600_000 } });
  router.post("/v1/journeys/:id/reroute", async (ctx) => ({ body: { journey: await svc.reroute(ctx.user!, id(ctx.params.id), parse(z.object({ origin: point }).strict(), ctx.body).origin, ctx.requestId) } }),
    { auth: "user", rateLimit: { name: "reroute", limit: 30, windowMs: 3_600_000 } });

  // ── Privacy-preserving ETA sharing: explicit consent, feature flag, time-limited, revocable, no live position ──
  router.post("/v1/journeys/:id/shares", async (ctx) => {
    const j = await svc.load(ctx.user!, id(ctx.params.id));
    const input = parse(z.object({ ttlMinutes: z.number().int().min(5).max(JOURNEY_POLICY.shareMaxTtlMinutes) }).strict(), ctx.body);
    const flag = await db.query<{ enabled: boolean }>("SELECT enabled FROM feature_flags WHERE key = 'journey_sharing'");
    if (!flag.rows[0]?.enabled) throw new ApiError(503, "FEATURE_DISABLED");
    if (!(await hasConsent(db, ctx.user!.id, "journey_sharing"))) throw forbidden("SHARING_CONSENT_REQUIRED");
    if (!["PLANNED", "ACTIVE", "PAUSED"].includes(j.status)) throw conflict("JOURNEY_NOT_SHAREABLE");
    const token = randomToken("rsh", 24);
    const expiresAt = new Date(deps.now().getTime() + input.ttlMinutes * 60_000);
    const { rows } = await db.query("INSERT INTO journey_shares (journey_id, token_hash, expires_at) VALUES ($1,$2,$3) RETURNING id", [j.id, sha256(token), expiresAt]);
    await audit(db, { actor: ctx.user, action: "journey.share_created", targetType: "JOURNEY", targetId: j.id, detail: { ttlMinutes: input.ttlMinutes }, requestId: ctx.requestId });
    return { status: 201, body: { shareId: rows[0].id, token, url: `${deps.config.publicWebUrl}/chia-se/${token}`, expiresAt: expiresAt.toISOString(), shows: ["status", "destinationLabel", "eta"] } };
  }, { auth: "user" });
  router.delete("/v1/journeys/:id/shares/:shareId", async (ctx) => {
    const j = await svc.load(ctx.user!, id(ctx.params.id));
    await db.query("UPDATE journey_shares SET revoked_at = now() WHERE id = $1 AND journey_id = $2 AND revoked_at IS NULL", [id(ctx.params.shareId), j.id]);
    await audit(db, { actor: ctx.user, action: "journey.share_revoked", targetType: "JOURNEY", targetId: j.id, requestId: ctx.requestId });
    return { status: 204 };
  }, { auth: "user" });
  router.get("/v1/shared-journeys/:token", async (ctx) => {
    const token = parse(z.string().regex(/^rsh_[A-Za-z0-9_-]{20,64}$/), ctx.params.token);
    const now = deps.now();
    const { rows } = await db.query(
      `SELECT j.status, j.destination_label, j.started_at, j.duration_s, s.expires_at FROM journey_shares s JOIN journeys j ON j.id = s.journey_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2`, [sha256(token), now]);
    const r = rows[0];
    if (!r) throw notFound("SHARE_NOT_FOUND_OR_EXPIRED");
    const eta = r.status === "ACTIVE" && r.started_at && r.duration_s ? new Date(r.started_at.getTime() + r.duration_s * 1000).toISOString() : null;
    return { body: { status: r.status, destinationLabel: r.destination_label, estimatedArrival: eta, etaLabel: "Ước tính ban đầu của nhà cung cấp định tuyến, không cập nhật theo vị trí", expiresAt: r.expires_at.toISOString() } };
  }, { rateLimit: { name: "share-read", limit: 60, windowMs: 60_000 } });
}
