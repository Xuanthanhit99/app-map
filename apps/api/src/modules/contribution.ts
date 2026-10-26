import { z } from "zod";
import type pg from "pg";
import { withTransaction, type Queryable } from "../db/pool";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../http/errors";
import type { AuthUser, Router } from "../http/router";
import { parse, queryObject } from "../http/validate";
import { geohash, geohashCenter, haversineMeters, parseBBox } from "../lib/geo";
import { DOMAIN_CATALOG, isDomainValue, type RealityDomain } from "../../../../src/reality/catalog";
import { hasConsent } from "./account";
import { audit } from "./audit";
import { propagate, CELL_PRECISION } from "./reality/repository";
import type { AppDeps } from "./deps";

/**
 * Contribution & Trust Engine.
 * - Opt-in: submitting or voting requires the `contribution_public` consent.
 * - Reports are evidence. Corroboration (>= 2 distinct contributors) or moderator verification is required
 *   before a community state is KNOWN (enforced by the State Engine, see src/reality/state-engine.ts).
 * - Precise locations are never returned publicly; public reads expose a ~150 m geohash cell.
 * - Held reports (low trust) are stored but excluded from evaluation until reviewed.
 */
export const TRUST = {
  holdBelowTrust: 0.15,
  perUserHourlyLimit: 12,
  duplicateRadiusM: 150,
  duplicateWindowMs: 30 * 60_000,
  maxReportAgeMs: 2 * 3_600_000,
  maxFutureSkewMs: 2_000,
  voteProximityM: 2_000,
  rewardCorroborated: 0.02,
  rewardVerified: 0.05,
  penaltyRejected: 0.1,
} as const;

export const reportSchema = z.object({
  domain: z.string(),
  value: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(5000).optional(),
  placeId: z.string().uuid().optional(),
  note: z.string().trim().max(500).optional(),
  observedAt: z.string().datetime().optional(),
  moving: z.boolean().default(false),
}).strict();

export const voteSchema = z.object({
  vote: z.enum(["CONFIRM", "DENY"]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
}).strict();

type ReportRow = {
  id: string; reporter_id: string | null; domain: RealityDomain; value: string; note: string | null; public_cell: string;
  place_id: string | null; cluster_id: string | null; status: string; observed_at: Date; expires_at: Date; created_at: Date;
  held_for_review: boolean; confirm_count: number; deny_count: number; lat?: number; lng?: number; moving_submission: boolean;
};

export function publicReport(r: ReportRow, own = false) {
  const c = geohashCenter(r.public_cell);
  return {
    id: r.id, domain: r.domain, value: r.value, valueLabel: DOMAIN_CATALOG[r.domain]?.values[r.value]?.label ?? r.value,
    status: r.status, placeId: r.place_id,
    // Public location is the centre of a ~150 m cell, never the submitted point.
    cell: r.public_cell, approximateCoordinate: [Math.round(c.lng * 1e4) / 1e4, Math.round(c.lat * 1e4) / 1e4] as [number, number],
    confirmCount: r.confirm_count, denyCount: r.deny_count,
    observedAt: r.observed_at.toISOString(), expiresAt: r.expires_at.toISOString(),
    ...(own ? { note: r.note, heldForReview: r.held_for_review, createdAt: r.created_at.toISOString() } : {}),
  };
}

export function subjectKeyFor(report: { domain: RealityDomain; place_id: string | null; geomLat: number; geomLng: number }): string {
  if (report.place_id) return `place:${report.place_id}:${report.domain}`;
  return `cell:${geohash(report.geomLat, report.geomLng, CELL_PRECISION[report.domain] ?? 7)}:${report.domain}`;
}

async function clusterRootLocation(q: Queryable, clusterId: string): Promise<{ lat: number; lng: number }> {
  const { rows } = await q.query<{ lat: number; lng: number }>("SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng FROM reports WHERE id = $1", [clusterId]);
  return rows[0]!;
}

/** Recompute cluster statuses after a change. Returns subject keys touched. */
async function recomputeCluster(q: pg.PoolClient, clusterId: string, now: Date): Promise<void> {
  const { rows } = await q.query<{ id: string; value: string; reporter_id: string | null; status: string; deny_count: number; confirm_count: number; held_for_review: boolean }>(
    `SELECT id, value, reporter_id, status, deny_count, confirm_count, held_for_review FROM reports
      WHERE cluster_id = $1 AND status IN ('PENDING','CORROBORATED','DISPUTED')`, [clusterId]);
  const counted = rows.filter((r) => !r.held_for_review);
  const contributorsByValue = new Map<string, Set<string>>();
  for (const r of counted) {
    const set = contributorsByValue.get(r.value) ?? new Set<string>();
    set.add(r.reporter_id ?? `anon:${r.id}`);
    // Each confirming vote is an independent contributor to that report's value.
    for (let i = 0; i < r.confirm_count; i++) set.add(`vote:${r.id}:${i}`);
    contributorsByValue.set(r.value, set);
  }
  const values = [...contributorsByValue.entries()].filter(([, s]) => s.size >= 2);
  for (const r of counted) {
    const denied = r.deny_count > 0 && r.deny_count >= (contributorsByValue.get(r.value)?.size ?? 1);
    const next = values.length > 1 || denied ? "DISPUTED" : values.some(([v]) => v === r.value) ? "CORROBORATED" : "PENDING";
    if (next !== r.status) {
      await q.query("UPDATE reports SET status = $2, updated_at = now() WHERE id = $1", [r.id, next]);
      if (next === "CORROBORATED" && r.reporter_id) {
        await q.query("UPDATE users SET trust_score = LEAST(1, trust_score + $2) WHERE id = $1", [r.reporter_id, TRUST.rewardCorroborated]);
      }
    }
  }
  // A denied value no longer contributes as evidence.
  await q.query(`UPDATE observations o SET valid_until = GREATEST(o.observed_at + interval '1 second', $2)
                  FROM reports r WHERE o.report_id = r.id AND r.cluster_id = $1 AND r.status = 'DISPUTED'
                   AND r.deny_count > r.confirm_count AND o.valid_until > $2`, [clusterId, now]);
}

export function createContributionService(deps: AppDeps) {
  const { db } = deps;

  async function requireOptIn(user: AuthUser) {
    if (!(await hasConsent(db, user.id, "contribution_public"))) throw forbidden("CONTRIBUTION_CONSENT_REQUIRED");
  }

  async function submit(user: AuthUser, input: z.infer<typeof reportSchema>, requestId: string) {
    if (!isDomainValue(input.domain, input.value)) throw badRequest("UNKNOWN_DOMAIN_VALUE", [{ path: "value", code: "invalid_enum_value" }]);
    const domain = input.domain as RealityDomain;
    const policy = DOMAIN_CATALOG[domain];
    if (!policy.reportable) throw badRequest("DOMAIN_NOT_REPORTABLE");
    if (policy.placeBound && !input.placeId) throw badRequest("PLACE_REQUIRED");
    if (input.moving && !["ROAD"].includes(domain)) throw badRequest("MOVING_REPORT_DOMAIN_NOT_ALLOWED");
    if (input.accuracyMeters !== undefined && input.accuracyMeters > 500) throw badRequest("LOCATION_TOO_IMPRECISE");
    await requireOptIn(user);

    const now = deps.now();
    const observedAt = input.observedAt ? new Date(input.observedAt) : now;
    if (observedAt.getTime() > now.getTime() + TRUST.maxFutureSkewMs) throw badRequest("OBSERVED_IN_FUTURE");
    if (now.getTime() - observedAt.getTime() > TRUST.maxReportAgeMs) throw badRequest("OBSERVATION_TOO_OLD");

    const hourly = await deps.rateLimits.hit(`reports:${user.id}`, TRUST.perUserHourlyLimit, 3_600_000);
    if (!hourly.allowed) throw new ApiError(429, "REPORT_RATE_LIMITED", undefined, undefined, { "Retry-After": String(Math.ceil((hourly.resetAt - Date.now()) / 1000)) });

    let place: { lat: number; lng: number } | null = null;
    if (input.placeId) {
      const r = await db.query<{ lat: number; lng: number }>("SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng FROM places WHERE id = $1 AND status = 'active'", [input.placeId]);
      if (!r.rows[0]) throw notFound("PLACE_NOT_FOUND");
      place = r.rows[0];
      // A place-bound report must be made near the place (prevents remote manipulation of venue states).
      if (haversineMeters(place, { lat: input.latitude, lng: input.longitude }) > 1_000) throw badRequest("TOO_FAR_FROM_PLACE");
    }

    const result = await withTransaction(db, async (client) => {
      const u = await client.query<{ trust_score: number; status: string }>("SELECT trust_score, status FROM users WHERE id = $1 FOR UPDATE", [user.id]);
      if (u.rows[0]?.status !== "active") throw forbidden("ACCOUNT_NOT_ACTIVE");
      const trust = u.rows[0].trust_score;
      const pt = "ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography";

      const since = new Date(now.getTime() - TRUST.duplicateWindowMs);
      const dup = input.placeId
        ? await client.query<{ id: string }>(
          `SELECT id FROM reports WHERE reporter_id = $1 AND domain = $2 AND status NOT IN ('REJECTED','EXPIRED','HIDDEN')
             AND created_at > $3 AND place_id = $4 LIMIT 1`, [user.id, domain, since, input.placeId])
        : await client.query<{ id: string }>(
          `SELECT id FROM reports WHERE reporter_id = $1 AND domain = $2 AND status NOT IN ('REJECTED','EXPIRED','HIDDEN')
             AND created_at > $3 AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6) LIMIT 1`,
          [user.id, domain, since, input.longitude, input.latitude, TRUST.duplicateRadiusM]);
      if (dup.rows[0]) throw new ApiError(409, "DUPLICATE_REPORT", undefined, [{ path: "reportId", code: dup.rows[0].id }]);

      const clusterFilter = input.placeId
        ? { sql: "place_id = $3", params: [input.placeId] }
        : { sql: "ST_DWithin(geom, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5)", params: [input.longitude, input.latitude, policy.clusterRadiusM] };
      const cluster = await client.query<{ id: string }>(
        `SELECT COALESCE(cluster_id, id) AS id FROM reports
          WHERE domain = $1 AND status IN ('PENDING','CORROBORATED','DISPUTED','VERIFIED') AND expires_at > $2 AND ${clusterFilter.sql}
          ORDER BY created_at ASC LIMIT 1`, [domain, now, ...clusterFilter.params]);
      const held = trust < TRUST.holdBelowTrust;
      const expiresAt = new Date(observedAt.getTime() + policy.reportTtlMs);
      const inserted = await client.query<ReportRow>(
        `INSERT INTO reports (reporter_id, domain, value, note, geom, public_cell, place_id, cluster_id, observed_at, expires_at, held_for_review, moving_submission)
         VALUES ($1, $4, $5, $6, ${pt}, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [user.id, input.longitude, input.latitude, domain, input.value, input.note ?? null, geohash(input.latitude, input.longitude, 7),
          input.placeId ?? null, cluster.rows[0]?.id ?? null, observedAt, expiresAt, held, input.moving]);
      const report = inserted.rows[0]!;
      const clusterId = report.cluster_id ?? report.id;
      if (!report.cluster_id) await client.query("UPDATE reports SET cluster_id = id WHERE id = $1", [report.id]);

      // Observation geometry = place point or the cluster root, so corroborating reports share one subject cell.
      const anchor = place ?? (report.cluster_id ? await clusterRootLocation(client, clusterId) : { lat: input.latitude, lng: input.longitude });
      await client.query(
        `INSERT INTO observations (domain, value, subject_type, place_id, geom, source_id, report_id, nature, observed_at, valid_until, confidence)
         VALUES ($1,$2,$3,$4, ST_SetSRID(ST_MakePoint($5,$6),4326)::geography, 'community', $7, 'COMMUNITY_REPORT', $8, $9, $10)`,
        [domain, input.value, input.placeId ? "PLACE" : "POINT", input.placeId ?? null, anchor.lng, anchor.lat, report.id, observedAt, expiresAt,
          Math.round((0.3 + 0.4 * trust) * 1000) / 1000]);
      if (!held) await recomputeCluster(client, clusterId, now);
      await audit(client, { actor: user, action: "report.submitted", targetType: "REPORT", targetId: report.id, detail: { domain, value: input.value, held, moving: input.moving }, requestId });
      const subjectKey = subjectKeyFor({ domain, place_id: input.placeId ?? null, geomLat: anchor.lat, geomLng: anchor.lng });
      const changes = held ? [] : await propagate(client, [subjectKey], now);
      const fresh = await client.query<ReportRow>("SELECT * FROM reports WHERE id = $1", [report.id]);
      return { report: publicReport(fresh.rows[0]!, true), subjectKey, stateChanged: changes.length > 0 };
    });
    return result;
  }

  async function vote(user: AuthUser, reportId: string, input: z.infer<typeof voteSchema>, requestId: string) {
    await requireOptIn(user);
    const now = deps.now();
    return withTransaction(db, async (client) => {
      const { rows } = await client.query<ReportRow & { lat: number; lng: number }>(
        `SELECT *, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng FROM reports WHERE id = $1 FOR UPDATE`, [reportId]);
      const r = rows[0];
      if (!r || r.held_for_review || !["PENDING", "CORROBORATED", "DISPUTED", "VERIFIED"].includes(r.status) || r.expires_at <= now) throw notFound("REPORT_NOT_FOUND");
      if (r.reporter_id === user.id) throw forbidden("CANNOT_VOTE_OWN_REPORT");
      // Only people near the reported cell can confirm/deny; the voter location is used for this check only, never stored.
      if (haversineMeters({ lat: r.lat, lng: r.lng }, { lat: input.latitude, lng: input.longitude }) > TRUST.voteProximityM) throw forbidden("TOO_FAR_TO_VERIFY");
      const ins = await client.query(`INSERT INTO report_votes (report_id, voter_id, vote) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [reportId, user.id, input.vote]);
      if (!ins.rowCount) throw conflict("ALREADY_VOTED");
      await client.query(`UPDATE reports SET ${input.vote === "CONFIRM" ? "confirm_count = confirm_count + 1" : "deny_count = deny_count + 1"}, updated_at = now() WHERE id = $1`, [reportId]);
      if (input.vote === "CONFIRM") {
        // A confirmation is an independent observation of the same value by the voter.
        const voter = await client.query<{ trust_score: number }>("SELECT trust_score FROM users WHERE id = $1", [user.id]);
        await client.query(
          `INSERT INTO observations (domain, value, subject_type, place_id, geom, source_id, report_id, nature, observed_at, valid_until, confidence, dedupe_key)
           SELECT o.domain, o.value, o.subject_type, o.place_id, o.geom, 'community', NULL, 'COMMUNITY_REPORT', $2, GREATEST(o.valid_until, $2::timestamptz + interval '30 minutes'), $3, $4
             FROM observations o WHERE o.report_id = $1 LIMIT 1`,
          [reportId, now, Math.round((0.3 + 0.4 * (voter.rows[0]?.trust_score ?? 0.5)) * 1000) / 1000, `vote:${reportId}:${user.id}`]);
      }
      await recomputeCluster(client, r.cluster_id ?? r.id, now);
      await audit(client, { actor: user, action: "report.voted", targetType: "REPORT", targetId: reportId, detail: { vote: input.vote }, requestId });
      const anchor = await client.query<{ lat: number; lng: number }>("SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng FROM observations WHERE report_id = $1 LIMIT 1", [reportId]);
      const a = anchor.rows[0] ?? { lat: r.lat, lng: r.lng };
      await propagate(client, [subjectKeyFor({ domain: r.domain, place_id: r.place_id, geomLat: a.lat, geomLng: a.lng })], now);
      const fresh = await client.query<ReportRow>("SELECT * FROM reports WHERE id = $1", [reportId]);
      return publicReport(fresh.rows[0]!);
    });
  }

  async function mine(user: AuthUser, limit = 50) {
    const { rows } = await db.query<ReportRow>("SELECT * FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC LIMIT $2", [user.id, limit]);
    return rows.map((r) => publicReport(r, true));
  }

  async function withdraw(user: AuthUser, reportId: string, requestId: string) {
    const now = deps.now();
    await withTransaction(db, async (client) => {
      const r = await client.query<ReportRow & { lat: number; lng: number }>(`SELECT *, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng FROM reports WHERE id = $1 AND reporter_id = $2 FOR UPDATE`, [reportId, user.id]);
      const row = r.rows[0];
      if (!row) throw notFound("REPORT_NOT_FOUND");
      await client.query("UPDATE reports SET status = 'HIDDEN', updated_at = now() WHERE id = $1", [reportId]);
      await client.query("UPDATE observations SET valid_until = GREATEST(observed_at + interval '1 second', $2) WHERE report_id = $1 AND valid_until > $2", [reportId, now]);
      if (row.cluster_id) await recomputeCluster(client, row.cluster_id, now);
      await audit(client, { actor: user, action: "report.withdrawn", targetType: "REPORT", targetId: reportId, requestId });
      const anchor = await client.query<{ lat: number; lng: number }>("SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng FROM observations WHERE report_id = $1 LIMIT 1", [reportId]);
      const a = anchor.rows[0] ?? { lat: row.lat, lng: row.lng };
      await propagate(client, [subjectKeyFor({ domain: row.domain, place_id: row.place_id, geomLat: a.lat, geomLng: a.lng })], now);
    });
  }

  async function publicList(bboxText: string, domain?: string) {
    const bbox = parseBBox(bboxText, 0.5);
    if (!bbox) throw badRequest("INVALID_BBOX");
    const { rows } = await db.query<ReportRow>(
      `SELECT * FROM reports WHERE status IN ('PENDING','CORROBORATED','VERIFIED','DISPUTED') AND held_for_review = false
         AND expires_at > $1 AND geom && ST_MakeEnvelope($2,$3,$4,$5,4326)::geography ${domain ? "AND domain = $6" : ""}
       ORDER BY observed_at DESC LIMIT 200`,
      [deps.now(), bbox.west, bbox.south, bbox.east, bbox.north, ...(domain ? [domain] : [])]);
    return rows.map((r) => publicReport(r));
  }

  return { submit, vote, mine, withdraw, publicList };
}

export async function expireReports(q: Queryable, now: Date): Promise<number> {
  const r = await q.query(`UPDATE reports SET status = 'EXPIRED', updated_at = now()
                            WHERE status IN ('PENDING','CORROBORATED','DISPUTED','VERIFIED') AND expires_at <= $1`, [now]);
  return r.rowCount ?? 0;
}

export function registerContributionRoutes(router: Router, deps: AppDeps) {
  const svc = createContributionService(deps);
  router.post("/v1/reports", async (ctx) => ({ status: 201, body: await svc.submit(ctx.user!, parse(reportSchema, ctx.body), ctx.requestId) }),
    { auth: "user", rateLimit: { name: "report-burst", limit: 6, windowMs: 60_000 } });
  router.post("/v1/reports/:id/votes", async (ctx) => ({ body: { report: await svc.vote(ctx.user!, parse(z.string().uuid(), ctx.params.id), parse(voteSchema, ctx.body), ctx.requestId) } }),
    { auth: "user", rateLimit: { name: "vote", limit: 30, windowMs: 3_600_000 } });
  router.delete("/v1/reports/:id", async (ctx) => { await svc.withdraw(ctx.user!, parse(z.string().uuid(), ctx.params.id), ctx.requestId); return { status: 204 }; }, { auth: "user" });
  router.get("/v1/me/reports", async (ctx) => ({ body: { items: await svc.mine(ctx.user!) } }), { auth: "user" });
  router.get("/v1/reports", async (ctx) => {
    const q = parse(z.object({ bbox: z.string().max(100), domain: z.string().regex(/^[A-Z_]{3,20}$/).optional() }).strict(), queryObject(ctx.query));
    return { body: { items: await svc.publicList(q.bbox, q.domain) } };
  });
}
