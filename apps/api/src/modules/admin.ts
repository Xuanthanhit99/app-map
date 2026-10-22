import { z } from "zod";
import { withTransaction } from "../db/pool";
import { badRequest, forbidden, notFound } from "../http/errors";
import type { Router } from "../http/router";
import { parse, queryObject } from "../http/validate";
import { createJobs } from "../ingestion/scheduler";
import { parseRegions } from "../ingestion/regions";
import { audit } from "./audit";
import { TRUST, publicReport, subjectKeyFor } from "./contribution";
import { computeDataReadiness } from "./data-readiness";
import { propagate } from "./reality/repository";
import type { AppDeps } from "./deps";

const uuid = z.string().uuid();
const page = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().regex(/^\d{1,5}$/).optional() });

/**
 * Admin & Operations console API. Every route is server-side role checked (moderator or admin) and every
 * mutating action is written to the append-only audit log.
 */
export function registerAdminRoutes(router: Router, deps: AppDeps, transport?: typeof fetch) {
  const { db } = deps;
  const regions = () => parseRegions();

  router.get("/v1/admin/dashboard", async () => {
    const now = deps.now();
    const q = async <T>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;
    const counts = await q<Record<string, number>>(`SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM users WHERE created_at > $1::timestamptz - interval '7 days') AS users_7d,
        (SELECT count(*)::int FROM places WHERE status = 'active') AS places,
        (SELECT count(*)::int FROM reports WHERE status IN ('PENDING','CORROBORATED','VERIFIED','DISPUTED') AND expires_at > $1) AS active_reports,
        (SELECT count(*)::int FROM reports WHERE held_for_review AND status NOT IN ('REJECTED','EXPIRED','HIDDEN')) AS held_reports,
        (SELECT count(*)::int FROM reports WHERE status = 'DISPUTED' AND expires_at > $1) AS disputed_reports,
        (SELECT count(*)::int FROM stories WHERE status = 'PENDING_REVIEW') AS stories_pending,
        (SELECT count(*)::int FROM incidents WHERE status <> 'RESOLVED') AS open_incidents,
        (SELECT count(*)::int FROM journeys WHERE status = 'ACTIVE') AS active_journeys,
        (SELECT count(*)::int FROM observations WHERE valid_until > $1) AS active_observations`, [now]);
    return { body: { generatedAt: now.toISOString(), counts, alerts: await alerts(now) } };
  }, { auth: "moderator" });

  async function alerts(now: Date) {
    const list: { severity: "WARNING" | "CRITICAL"; code: string; message: string }[] = [];
    const open = await db.query<{ id: string; last_error_code: string | null }>("SELECT source_id AS id, last_error_code FROM source_health h JOIN data_sources s ON s.id = h.source_id WHERE s.enabled AND h.circuit_state <> 'CLOSED'");
    for (const s of open.rows) list.push({ severity: "CRITICAL", code: "SOURCE_CIRCUIT_OPEN", message: `Nguồn ${s.id} đang ngắt mạch (${s.last_error_code ?? "lỗi"})` });
    const stale = await db.query<{ id: string }>(`SELECT h.source_id AS id FROM source_health h JOIN data_sources s ON s.id = h.source_id
        WHERE s.enabled AND s.id IN ('open-meteo') AND (h.last_success_at IS NULL OR h.last_success_at < $1::timestamptz - interval '1 hour')`, [now]);
    for (const s of stale.rows) list.push({ severity: "WARNING", code: "SOURCE_STALE", message: `Nguồn ${s.id} chưa cập nhật thành công trong 1 giờ` });
    const held = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM reports WHERE held_for_review AND status = 'PENDING' AND created_at < $1::timestamptz - interval '30 minutes'", [now]);
    if ((held.rows[0]?.n ?? 0) > 0) list.push({ severity: "WARNING", code: "MODERATION_BACKLOG", message: `${held.rows[0]!.n} báo cáo bị giữ chờ duyệt hơn 30 phút` });
    return list;
  }

  router.get("/v1/admin/alerts", async () => ({ body: { items: await alerts(deps.now()) } }), { auth: "moderator" });

  router.get("/v1/admin/sources", async () => {
    const { rows } = await db.query(`SELECT s.*, h.circuit_state, h.consecutive_failures, h.opened_at, h.last_success_at, h.last_failure_at, h.last_error_code
                                       FROM data_sources s JOIN source_health h ON h.source_id = s.id ORDER BY s.id`);
    return { body: { items: rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, domains: r.domains, license: r.license, attribution: r.attribution,
      commercialUse: r.commercial_use, updateFrequency: r.update_frequency, nature: r.data_nature, reliability: r.reliability, enabled: r.enabled, notes: r.notes,
      health: { circuit: r.circuit_state, consecutiveFailures: r.consecutive_failures, openedAt: r.opened_at, lastSuccessAt: r.last_success_at, lastFailureAt: r.last_failure_at, lastErrorCode: r.last_error_code } })) } };
  }, { auth: "moderator" });

  router.patch("/v1/admin/sources/:id", async (ctx) => {
    const input = parse(z.object({ enabled: z.boolean().optional(), resetCircuit: z.literal(true).optional() }).strict(), ctx.body);
    const id = parse(z.string().regex(/^[a-z0-9-]{2,40}$/), ctx.params.id);
    const r = await db.query("UPDATE data_sources SET enabled = COALESCE($2, enabled) WHERE id = $1 RETURNING id", [id, input.enabled ?? null]);
    if (!r.rowCount) throw notFound("SOURCE_NOT_FOUND");
    if (input.resetCircuit) await db.query("UPDATE source_health SET circuit_state = 'CLOSED', consecutive_failures = 0, opened_at = NULL, updated_at = now() WHERE source_id = $1", [id]);
    await audit(db, { actor: ctx.user, action: "admin.source_updated", targetType: "SOURCE", targetId: id, detail: input, requestId: ctx.requestId });
    return { status: 204 };
  }, { auth: "admin" });

  router.get("/v1/admin/ingestion/runs", async (ctx) => {
    const q = parse(page.extend({ sourceId: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(), status: z.enum(["RUNNING", "SUCCEEDED", "FAILED", "SKIPPED"]).optional() }).strict(), queryObject(ctx.query));
    const { rows } = await db.query(
      `SELECT id, source_id, scope, status, started_at, finished_at, records_in, records_upserted, records_rejected, error_code, attempt FROM ingestion_runs
        WHERE ($1::text IS NULL OR source_id = $1) AND ($2::text IS NULL OR status = $2) ORDER BY started_at DESC LIMIT $3 OFFSET $4`,
      [q.sourceId ?? null, q.status ?? null, q.limit + 1, Number(q.cursor ?? 0)]);
    return { body: { items: rows.slice(0, q.limit), nextCursor: rows.length > q.limit ? String(Number(q.cursor ?? 0) + q.limit) : null } };
  }, { auth: "moderator" });

  router.post("/v1/admin/ingestion/run", async (ctx) => {
    const input = parse(z.object({ job: z.enum(["places", "weather", "maintenance"]), regionId: z.string().regex(/^[a-z0-9-]{2,40}$/).optional() }).strict(), ctx.body);
    const jobs = createJobs({ db, config: deps.config, regions: regions(), now: deps.now, ...(transport ? { transport } : {}), log: () => undefined });
    await jobs.ensureRegions();
    const result = input.job === "maintenance" ? await jobs.maintenance() : await jobs[input.job](input.regionId);
    await audit(db, { actor: ctx.user, action: "admin.ingestion_triggered", targetType: "JOB", targetId: input.job, detail: { regionId: input.regionId ?? null }, requestId: ctx.requestId });
    return { body: { job: input.job, result } };
  }, { auth: "admin", rateLimit: { name: "ingest-trigger", limit: 10, windowMs: 3_600_000 } });

  router.get("/v1/admin/data-readiness", async () => ({ body: await computeDataReadiness(db, regions(), deps.now()) }), { auth: "moderator" });

  // ── Reports moderation & trust review ──
  router.get("/v1/admin/reports", async (ctx) => {
    const q = parse(page.extend({ status: z.enum(["PENDING", "CORROBORATED", "VERIFIED", "DISPUTED", "REJECTED", "EXPIRED", "DUPLICATE", "HIDDEN"]).optional(), held: z.enum(["true", "false"]).optional() }).strict(), queryObject(ctx.query));
    const { rows } = await db.query(
      `SELECT r.*, u.display_name AS reporter_name, u.trust_score AS reporter_trust FROM reports r LEFT JOIN users u ON u.id = r.reporter_id
        WHERE ($1::text IS NULL OR r.status = $1) AND ($2::boolean IS NULL OR r.held_for_review = $2)
        ORDER BY r.held_for_review DESC, r.created_at DESC LIMIT $3 OFFSET $4`,
      [q.status ?? null, q.held === undefined ? null : q.held === "true", q.limit + 1, Number(q.cursor ?? 0)]);
    return { body: { items: rows.slice(0, q.limit).map((r) => ({ ...publicReport(r, true), reporter: r.reporter_id ? { id: r.reporter_id, displayName: r.reporter_name, trustScore: r.reporter_trust } : null, clusterId: r.cluster_id })),
      nextCursor: rows.length > q.limit ? String(Number(q.cursor ?? 0) + q.limit) : null } };
  }, { auth: "moderator" });

  router.post("/v1/admin/reports/:id/moderate", async (ctx) => {
    const id = parse(uuid, ctx.params.id);
    const input = parse(z.object({ action: z.enum(["VERIFY", "REJECT", "HIDE", "RELEASE"]), reason: z.string().trim().min(3).max(500) }).strict(), ctx.body);
    const now = deps.now();
    const result = await withTransaction(db, async (client) => {
      const { rows } = await client.query(`SELECT *, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng FROM reports WHERE id = $1 FOR UPDATE`, [id]);
      const r = rows[0];
      if (!r) throw notFound("REPORT_NOT_FOUND");
      if (r.reporter_id === ctx.user!.id) throw forbidden("CANNOT_MODERATE_OWN_REPORT");
      const anchorRow = await client.query<{ lat: number; lng: number }>("SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng FROM observations WHERE report_id = $1 LIMIT 1", [id]);
      const anchor = anchorRow.rows[0] ?? { lat: r.lat, lng: r.lng };
      if (input.action === "VERIFY") {
        if (r.expires_at <= now) throw badRequest("REPORT_EXPIRED");
        await client.query("UPDATE reports SET status = 'VERIFIED', held_for_review = false, updated_at = now() WHERE cluster_id = $1 AND value = $2 AND status IN ('PENDING','CORROBORATED','DISPUTED')", [r.cluster_id ?? r.id, r.value]);
        // Moderator verification is a separate, attributable observation (source reality-moderation).
        await client.query(
          `INSERT INTO observations (domain, value, subject_type, place_id, geom, source_id, nature, observed_at, valid_until, confidence, dedupe_key)
           VALUES ($1,$2,$3,$4, ST_SetSRID(ST_MakePoint($5,$6),4326)::geography, 'reality-moderation', 'LIVE_OBSERVATION', $7, $8, 0.9, $9)
           ON CONFLICT (source_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
          [r.domain, r.value, r.place_id ? "PLACE" : "POINT", r.place_id, anchor.lng, anchor.lat, now, r.expires_at, `verify:${r.cluster_id ?? r.id}:${r.value}`]);
        await client.query(`UPDATE users SET trust_score = LEAST(1, trust_score + $2) WHERE id IN (SELECT reporter_id FROM reports WHERE cluster_id = $1 AND value = $3 AND reporter_id IS NOT NULL)`, [r.cluster_id ?? r.id, TRUST.rewardVerified, r.value]);
      } else if (input.action === "REJECT" || input.action === "HIDE") {
        await client.query("UPDATE reports SET status = $2, updated_at = now() WHERE id = $1", [id, input.action === "REJECT" ? "REJECTED" : "HIDDEN"]);
        await client.query(`UPDATE observations SET valid_until = GREATEST(observed_at + interval '1 second', $2) WHERE (report_id = $1 OR dedupe_key LIKE 'vote:' || $1 || ':%') AND valid_until > $2`, [id, now]);
        if (input.action === "REJECT" && r.reporter_id) await client.query("UPDATE users SET trust_score = GREATEST(0, trust_score - $2) WHERE id = $1", [r.reporter_id, TRUST.penaltyRejected]);
      } else {
        await client.query("UPDATE reports SET held_for_review = false, updated_at = now() WHERE id = $1", [id]);
      }
      await client.query("INSERT INTO moderation_actions (target_type, target_id, moderator_id, action, reason) VALUES ('REPORT',$1,$2,$3,$4)", [id, ctx.user!.id, input.action, input.reason]);
      await audit(client, { actor: ctx.user, action: `moderation.report_${input.action.toLowerCase()}`, targetType: "REPORT", targetId: id, requestId: ctx.requestId });
      const changes = await propagate(client, [subjectKeyFor({ domain: r.domain, place_id: r.place_id, geomLat: anchor.lat, geomLng: anchor.lng })], now);
      const fresh = await client.query("SELECT * FROM reports WHERE id = $1", [id]);
      return { report: publicReport(fresh.rows[0], true), stateChanged: changes.length > 0 };
    });
    return { body: result };
  }, { auth: "moderator" });

  router.get("/v1/admin/conflicts", async () => {
    const { rows } = await db.query(
      `SELECT * FROM (SELECT DISTINCT ON (subject_key) subject_key, domain, truth, value, freshness, evaluated_at, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng
          FROM reality_state_snapshots ORDER BY subject_key, evaluated_at DESC, id DESC) s WHERE truth = 'CONFLICT' ORDER BY evaluated_at DESC LIMIT 100`);
    return { body: { items: rows.map((r) => ({ subjectKey: r.subject_key, domain: r.domain, freshness: r.freshness, since: r.evaluated_at.toISOString(), coordinate: [r.lng, r.lat] })) } };
  }, { auth: "moderator" });

  // ── Users & abuse ──
  router.get("/v1/admin/users", async (ctx) => {
    const q = parse(page.extend({ q: z.string().trim().min(2).max(100).optional(), status: z.enum(["active", "suspended", "banned"]).optional() }).strict(), queryObject(ctx.query));
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.display_name, u.role, u.status, u.trust_score, u.created_at, u.last_login_at,
              (SELECT count(*)::int FROM reports r WHERE r.reporter_id = u.id) AS reports,
              (SELECT count(*)::int FROM reports r WHERE r.reporter_id = u.id AND r.status = 'REJECTED') AS rejected
         FROM users u WHERE ($1::text IS NULL OR lower(u.email) LIKE '%' || lower($1) || '%' OR lower(u.display_name) LIKE '%' || lower($1) || '%')
          AND ($2::text IS NULL OR u.status = $2) ORDER BY u.created_at DESC LIMIT $3 OFFSET $4`,
      [q.q ?? null, q.status ?? null, q.limit + 1, Number(q.cursor ?? 0)]);
    return { body: { items: rows.slice(0, q.limit).map((u) => ({ id: u.id, email: u.email, displayName: u.display_name, role: u.role, status: u.status, trustScore: u.trust_score, createdAt: u.created_at, lastLoginAt: u.last_login_at, reports: u.reports, rejectedReports: u.rejected })),
      nextCursor: rows.length > q.limit ? String(Number(q.cursor ?? 0) + q.limit) : null } };
  }, { auth: "moderator" });

  router.patch("/v1/admin/users/:id", async (ctx) => {
    const id = parse(uuid, ctx.params.id);
    const input = parse(z.object({ status: z.enum(["active", "suspended", "banned"]).optional(), role: z.enum(["user", "moderator", "admin"]).optional(), reason: z.string().trim().min(3).max(500) }).strict(), ctx.body);
    if (id === ctx.user!.id) throw forbidden("CANNOT_MODIFY_SELF");
    if (input.role && ctx.user!.role !== "admin") throw forbidden("INSUFFICIENT_ROLE");
    const target = await db.query<{ role: string }>("SELECT role FROM users WHERE id = $1", [id]);
    if (!target.rows[0]) throw notFound("USER_NOT_FOUND");
    if (target.rows[0].role !== "user" && ctx.user!.role !== "admin") throw forbidden("INSUFFICIENT_ROLE");
    await withTransaction(db, async (client) => {
      await client.query("UPDATE users SET status = COALESCE($2, status), role = COALESCE($3, role), updated_at = now() WHERE id = $1", [id, input.status ?? null, input.role ?? null]);
      if (input.status && input.status !== "active") {
        await client.query("UPDATE sessions SET revoked_at = now(), revoke_reason = 'ACCOUNT_' || upper($2) WHERE user_id = $1 AND revoked_at IS NULL", [id, input.status]);
      }
      await client.query("INSERT INTO moderation_actions (target_type, target_id, moderator_id, action, reason) VALUES ('USER',$1,$2,$3,$4)", [id, ctx.user!.id, JSON.stringify({ status: input.status, role: input.role }), input.reason]);
      await audit(client, { actor: ctx.user, action: "admin.user_updated", targetType: "USER", targetId: id, detail: { status: input.status ?? null, role: input.role ?? null }, requestId: ctx.requestId });
    });
    return { status: 204 };
  }, { auth: "moderator" });

  router.get("/v1/admin/audit", async (ctx) => {
    const q = parse(page.extend({ action: z.string().regex(/^[a-z_.]{2,60}$/).optional(), actorId: uuid.optional() }).strict(), queryObject(ctx.query));
    const { rows } = await db.query(
      `SELECT id, actor_id, actor_role, action, target_type, target_id, detail, request_id, created_at FROM audit_events
        WHERE ($1::text IS NULL OR action = $1) AND ($2::uuid IS NULL OR actor_id = $2) ORDER BY id DESC LIMIT $3 OFFSET $4`,
      [q.action ?? null, q.actorId ?? null, q.limit + 1, Number(q.cursor ?? 0)]);
    return { body: { items: rows.slice(0, q.limit), nextCursor: rows.length > q.limit ? String(Number(q.cursor ?? 0) + q.limit) : null } };
  }, { auth: "admin" });

  // ── Feature flags ──
  router.get("/v1/admin/flags", async () => ({ body: { items: (await db.query("SELECT key, enabled, description, updated_at FROM feature_flags ORDER BY key")).rows } }), { auth: "moderator" });
  router.patch("/v1/admin/flags/:key", async (ctx) => {
    const key = parse(z.string().regex(/^[a-z_]{2,40}$/), ctx.params.key);
    const input = parse(z.object({ enabled: z.boolean() }).strict(), ctx.body);
    const r = await db.query("UPDATE feature_flags SET enabled = $2, updated_by = $3, updated_at = now() WHERE key = $1", [key, input.enabled, ctx.user!.id]);
    if (!r.rowCount) throw notFound("FLAG_NOT_FOUND");
    await audit(db, { actor: ctx.user, action: "admin.flag_changed", targetType: "FLAG", targetId: key, detail: { enabled: input.enabled }, requestId: ctx.requestId });
    return { status: 204 };
  }, { auth: "admin" });

  // ── Incidents (verified safety-critical conditions, created by moderators from evidence) ──
  router.get("/v1/admin/incidents", async () => {
    const { rows } = await db.query("SELECT id, title, severity, status, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng, radius_m, report_ids, created_at, resolved_at FROM incidents ORDER BY created_at DESC LIMIT 100");
    return { body: { items: rows.map((r) => ({ ...r, coordinate: r.lat === null ? null : [r.lng, r.lat] })) } };
  }, { auth: "moderator" });
  router.post("/v1/admin/incidents", async (ctx) => {
    const input = parse(z.object({ title: z.string().trim().min(4).max(160), severity: z.enum(["SIGNIFICANT", "SAFETY_CRITICAL"]),
      reportIds: z.array(uuid).min(1).max(50), radiusM: z.number().int().min(50).max(50_000).default(500) }).strict(), ctx.body);
    // An incident must be grounded in verified evidence: at least one VERIFIED report.
    const ev = await db.query<{ lat: number; lng: number }>(`SELECT ST_Y(ST_Centroid(ST_Collect(geom::geometry))) AS lat, ST_X(ST_Centroid(ST_Collect(geom::geometry))) AS lng
         FROM reports WHERE id = ANY($1) AND status = 'VERIFIED'`, [input.reportIds]);
    if (ev.rows[0]?.lat === null || ev.rows[0]?.lat === undefined) throw badRequest("VERIFIED_EVIDENCE_REQUIRED");
    const { rows } = await db.query(`INSERT INTO incidents (title, severity, geom, radius_m, report_ids, created_by)
        VALUES ($1,$2, ST_SetSRID(ST_MakePoint($3,$4),4326)::geography, $5, $6, $7) RETURNING id`,
      [input.title, input.severity, ev.rows[0]!.lng, ev.rows[0]!.lat, input.radiusM, input.reportIds, ctx.user!.id]);
    await audit(db, { actor: ctx.user, action: "incident.created", targetType: "INCIDENT", targetId: rows[0].id, detail: { severity: input.severity }, requestId: ctx.requestId });
    return { status: 201, body: { id: rows[0].id } };
  }, { auth: "moderator" });
  router.patch("/v1/admin/incidents/:id", async (ctx) => {
    const id = parse(uuid, ctx.params.id);
    const input = parse(z.object({ status: z.enum(["OPEN", "MONITORING", "RESOLVED"]) }).strict(), ctx.body);
    const r = await db.query("UPDATE incidents SET status = $2, resolved_at = CASE WHEN $2 = 'RESOLVED' THEN now() ELSE NULL END WHERE id = $1", [id, input.status]);
    if (!r.rowCount) throw notFound("INCIDENT_NOT_FOUND");
    await audit(db, { actor: ctx.user, action: "incident.updated", targetType: "INCIDENT", targetId: id, detail: input, requestId: ctx.requestId });
    return { status: 204 };
  }, { auth: "moderator" });

  // ── Places (content quality) ──
  router.patch("/v1/admin/places/:id", async (ctx) => {
    const id = parse(uuid, ctx.params.id);
    const input = parse(z.object({ status: z.enum(["active", "hidden"]), reason: z.string().trim().min(3).max(500) }).strict(), ctx.body);
    const r = await db.query("UPDATE places SET status = $2, updated_at = now() WHERE id = $1", [id, input.status]);
    if (!r.rowCount) throw notFound("PLACE_NOT_FOUND");
    await db.query("INSERT INTO moderation_actions (target_type, target_id, moderator_id, action, reason) VALUES ('PLACE',$1,$2,$3,$4)", [id, ctx.user!.id, input.status, input.reason]);
    await audit(db, { actor: ctx.user, action: "admin.place_status", targetType: "PLACE", targetId: id, detail: { status: input.status }, requestId: ctx.requestId });
    return { status: 204 };
  }, { auth: "moderator" });
}
