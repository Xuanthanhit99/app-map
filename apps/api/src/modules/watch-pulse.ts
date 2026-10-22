import { z } from "zod";
import { badRequest, notFound } from "../http/errors";
import type { Router } from "../http/router";
import { parse, queryObject } from "../http/validate";
import { parseBBox } from "../lib/geo";
import { DOMAIN_CATALOG, REALITY_DOMAINS, SEVERITY_RANK, type RealityDomain } from "../../../../src/reality/catalog";
import { hasConsent } from "./account";
import { audit } from "./audit";
import { evaluateSubject } from "./reality/repository";
import type { AppDeps } from "./deps";

const domainList = z.array(z.enum(REALITY_DOMAINS as [RealityDomain, ...RealityDomain[]])).min(1).max(9);
export const watchSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CIRCLE"), label: z.string().trim().min(1).max(60), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
    radiusMeters: z.number().int().min(50).max(10_000), domains: domainList, minSeverity: z.enum(["INFO", "MINOR", "SIGNIFICANT", "SAFETY_CRITICAL"]).default("SIGNIFICANT") }).strict(),
  z.object({ kind: z.literal("PLACE"), label: z.string().trim().min(1).max(60).optional(), placeId: z.string().uuid(), radiusMeters: z.number().int().min(50).max(2_000).default(150),
    domains: domainList, minSeverity: z.enum(["INFO", "MINOR", "SIGNIFICANT", "SAFETY_CRITICAL"]).default("MINOR") }).strict(),
  z.object({ kind: z.literal("ROUTE"), label: z.string().trim().min(1).max(60), journeyId: z.string().uuid(), radiusMeters: z.number().int().min(50).max(1_000).default(300),
    domains: domainList, minSeverity: z.enum(["INFO", "MINOR", "SIGNIFICANT", "SAFETY_CRITICAL"]).default("SIGNIFICANT") }).strict(),
]);

/**
 * Smart Watch Areas (opt-in) and World Pulse.
 * Notifications are produced by state *changes* only (see repository.fanOutChange): severity thresholds,
 * per-subject cooldown and dedupe keys prevent spam.
 */
export function registerWatchAndPulseRoutes(router: Router, deps: AppDeps) {
  const { db } = deps;

  router.get("/v1/me/watch-areas", async (ctx) => {
    const { rows } = await db.query(
      `SELECT id, label, kind, radius_m, domains, min_severity, active, place_id, created_at,
              ST_AsGeoJSON(CASE WHEN kind = 'ROUTE' THEN ST_Simplify(geom::geometry, 0.0002) ELSE geom::geometry END)::json AS geometry
         FROM watch_areas WHERE user_id = $1 ORDER BY created_at DESC`, [ctx.user!.id]);
    return { body: { items: rows.map((r) => ({ id: r.id, label: r.label, kind: r.kind, radiusMeters: r.radius_m, domains: r.domains, minSeverity: r.min_severity, active: r.active, placeId: r.place_id, geometry: r.geometry, createdAt: r.created_at })) } };
  }, { auth: "user" });

  router.post("/v1/me/watch-areas", async (ctx) => {
    const input = parse(watchSchema, ctx.body);
    const user = ctx.user!;
    const count = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM watch_areas WHERE user_id = $1", [user.id]);
    if ((count.rows[0]?.n ?? 0) >= 20) throw badRequest("WATCH_AREA_LIMIT");
    let geomSql: string, params: unknown[], label: string, placeId: string | null = null;
    if (input.kind === "CIRCLE") {
      geomSql = "ST_SetSRID(ST_MakePoint($1,$2),4326)::geography"; params = [input.longitude, input.latitude]; label = input.label;
    } else if (input.kind === "PLACE") {
      const p = await db.query<{ name: string }>("SELECT name FROM places WHERE id = $1 AND status = 'active'", [input.placeId]);
      if (!p.rows[0]) throw notFound("PLACE_NOT_FOUND");
      geomSql = "(SELECT geom FROM places WHERE id = $1)"; params = [input.placeId]; label = input.label ?? p.rows[0].name; placeId = input.placeId;
    } else {
      const j = await db.query("SELECT 1 FROM journeys WHERE id = $1 AND user_id = $2 AND route_geom IS NOT NULL", [input.journeyId, user.id]);
      if (!j.rowCount) throw notFound("JOURNEY_ROUTE_NOT_FOUND");
      geomSql = "(SELECT route_geom FROM journeys WHERE id = $1)"; params = [input.journeyId]; label = input.label;
    }
    const base = params.length;
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO watch_areas (user_id, label, kind, geom, radius_m, place_id, domains, min_severity)
       VALUES ($${base + 1}, $${base + 2}, $${base + 3}, ${geomSql}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}) RETURNING id`,
      [...params, user.id, label, input.kind, input.radiusMeters, placeId, input.domains, input.minSeverity]);
    await audit(db, { actor: user, action: "watch.created", targetType: "WATCH_AREA", targetId: rows[0]!.id, detail: { kind: input.kind }, requestId: ctx.requestId });
    return { status: 201, body: { id: rows[0]!.id } };
  }, { auth: "user" });

  router.patch("/v1/me/watch-areas/:id", async (ctx) => {
    const id = parse(z.string().uuid(), ctx.params.id);
    const input = parse(z.object({ active: z.boolean().optional(), minSeverity: z.enum(["INFO", "MINOR", "SIGNIFICANT", "SAFETY_CRITICAL"]).optional(), label: z.string().trim().min(1).max(60).optional() }).strict(), ctx.body);
    const r = await db.query("UPDATE watch_areas SET active = COALESCE($3, active), min_severity = COALESCE($4, min_severity), label = COALESCE($5, label) WHERE id = $1 AND user_id = $2",
      [id, ctx.user!.id, input.active ?? null, input.minSeverity ?? null, input.label ?? null]);
    if (!r.rowCount) throw notFound("WATCH_AREA_NOT_FOUND");
    return { status: 204 };
  }, { auth: "user" });

  router.delete("/v1/me/watch-areas/:id", async (ctx) => {
    const id = parse(z.string().uuid(), ctx.params.id);
    const r = await db.query("DELETE FROM watch_areas WHERE id = $1 AND user_id = $2", [id, ctx.user!.id]);
    if (!r.rowCount) throw notFound("WATCH_AREA_NOT_FOUND");
    return { status: 204 };
  }, { auth: "user" });

  // ── Notifications ──
  router.get("/v1/me/notifications", async (ctx) => {
    const q = parse(z.object({ unread: z.enum(["true", "false"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }).strict(), queryObject(ctx.query));
    const { rows } = await db.query(
      `SELECT id, kind, severity, title, body, data, read_at, created_at FROM notifications
        WHERE user_id = $1 AND ($2::boolean IS NULL OR (read_at IS NULL) = $2) ORDER BY created_at DESC LIMIT $3`,
      [ctx.user!.id, q.unread === undefined ? null : q.unread === "true", q.limit]);
    const unread = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [ctx.user!.id]);
    return { body: { unreadCount: unread.rows[0]?.n ?? 0, items: rows.map((r) => ({ id: r.id, kind: r.kind, severity: r.severity, title: r.title, body: r.body, data: r.data, readAt: r.read_at, createdAt: r.created_at })) } };
  }, { auth: "user" });
  router.post("/v1/me/notifications/read", async (ctx) => {
    const input = parse(z.object({ ids: z.array(z.string().uuid()).max(100).optional(), all: z.literal(true).optional() }).strict(), ctx.body);
    if (!input.ids && !input.all) throw badRequest("IDS_OR_ALL_REQUIRED");
    await db.query(`UPDATE notifications SET read_at = $3 WHERE user_id = $1 AND read_at IS NULL AND ($2::uuid[] IS NULL OR id = ANY($2))`, [ctx.user!.id, input.all ? null : input.ids, deps.now()]);
    return { status: 204 };
  }, { auth: "user" });
  router.post("/v1/me/push-tokens", async (ctx) => {
    const input = parse(z.object({ token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,100}\]$/), platform: z.enum(["ios", "android", "web"]) }).strict(), ctx.body);
    if (!(await hasConsent(db, ctx.user!.id, "notifications"))) throw badRequest("NOTIFICATION_CONSENT_REQUIRED");
    await db.query("INSERT INTO push_tokens (token, user_id, platform) VALUES ($1,$2,$3) ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, disabled_at = NULL, disabled_reason = NULL", [input.token, ctx.user!.id, input.platform]);
    return { status: 204 };
  }, { auth: "user" });
  // Sign-out / opt-out on a device: the token stops receiving pushes for this account.
  router.post("/v1/me/push-tokens/remove", async (ctx) => {
    const input = parse(z.object({ token: z.string().min(10).max(200) }).strict(), ctx.body);
    await db.query("DELETE FROM push_tokens WHERE token = $1 AND user_id = $2", [input.token, ctx.user!.id]);
    return { status: 204 };
  }, { auth: "user" });

  // ── World Pulse: meaningful changes in an area, each with source, freshness, confidence, impact and a follow-up ──
  async function pulse(bboxText: string, hours: number) {
    const bbox = parseBBox(bboxText, 1);
    if (!bbox) throw badRequest("INVALID_BBOX");
    const now = deps.now();
    const { rows } = await db.query<{ subject_key: string; prev_truth: string | null; prev_value: string | null; evaluated_at: Date }>(
      `SELECT subject_key, evaluated_at,
              (SELECT p.truth FROM reality_state_snapshots p WHERE p.subject_key = s.subject_key AND p.evaluated_at < s.evaluated_at ORDER BY p.evaluated_at DESC, p.id DESC LIMIT 1) AS prev_truth,
              (SELECT p.value FROM reality_state_snapshots p WHERE p.subject_key = s.subject_key AND p.evaluated_at < s.evaluated_at ORDER BY p.evaluated_at DESC, p.id DESC LIMIT 1) AS prev_value
         FROM (SELECT DISTINCT ON (subject_key) subject_key, evaluated_at FROM reality_state_snapshots
                WHERE evaluated_at > $1::timestamptz - make_interval(hours => $6) AND geom && ST_MakeEnvelope($2,$3,$4,$5,4326)::geography
                ORDER BY subject_key, evaluated_at DESC, id DESC) s
        ORDER BY evaluated_at DESC LIMIT 100`, [now, bbox.west, bbox.south, bbox.east, bbox.north, hours]);
    const items = [];
    for (const r of rows) {
      const ev = await evaluateSubject(db, r.subject_key, now);
      if (!ev) continue;
      const s = ev.state;
      if (s.truth === "UNKNOWN" && !s.signals.length && !r.prev_truth) continue;
      const placeId = r.subject_key.startsWith("place:") ? r.subject_key.split(":")[1] : null;
      const followUp = s.truth === "KNOWN" && s.safety !== "NONE" ? "AVOID_OR_REROUTE" : s.truth !== "KNOWN" ? "HELP_VERIFY" : placeId ? "VIEW_PLACE" : "VIEW_ON_MAP";
      items.push({
        id: `${r.subject_key}@${r.evaluated_at.toISOString()}`, subjectKey: r.subject_key, placeId, domain: s.domain,
        headline: s.truth === "KNOWN" ? s.label : s.truth === "CONFLICT" ? `${DOMAIN_CATALOG[s.domain].label}: thông tin mâu thuẫn`
          : s.signals[0] ? `${DOMAIN_CATALOG[s.domain].label}: có báo cáo "${DOMAIN_CATALOG[s.domain].values[s.signals[0].value]?.label ?? s.signals[0].value}" chưa xác minh`
          : `${DOMAIN_CATALOG[s.domain].label}: không còn bằng chứng hiện hành`,
        change: { from: r.prev_truth ? { truth: r.prev_truth, value: r.prev_value } : null, to: { truth: s.truth, value: s.value }, at: r.evaluated_at.toISOString() },
        truth: s.truth, value: s.value, freshness: s.freshness, confidence: s.confidence, nature: s.nature, severity: s.severity, safety: s.safety,
        sources: s.sources, signals: s.signals, observedAt: s.observedAt, coordinate: [ev.lng, ev.lat], followUp,
      });
    }
    items.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.change.at.localeCompare(a.change.at));
    return { now, items };
  }

  router.get("/v1/reality/pulse", async (ctx) => {
    const q = parse(z.object({ bbox: z.string().max(100), hours: z.coerce.number().int().min(1).max(24).default(6) }).strict(), queryObject(ctx.query));
    const { now, items } = await pulse(q.bbox, q.hours);
    return { body: { status: items.length ? "ready" : "empty", ...(items.length ? {} : { reason: "NO_RECENT_CHANGES" }), items, evaluatedAt: now.toISOString(),
      note: "Không có thay đổi được ghi nhận không có nghĩa là khu vực an toàn." } };
  });

  // Legacy P0 path used by the mobile client: same envelope, requires an area.
  router.get("/v1/reality/pulses", async (ctx) => {
    const bbox = ctx.query.get("bbox");
    const now = deps.now();
    if (!bbox) return { body: { status: "empty", items: [], reason: "AREA_REQUIRED", provenance: [], evidence: { truth: "UNKNOWN", freshness: null, source: null, observedAt: null }, generatedAt: now.toISOString() } };
    const { items } = await pulse(bbox, 6);
    return { body: { status: items.length ? "ready" : "empty", items: items.slice(0, 30), ...(items.length ? {} : { reason: "NO_VERIFIED_DATA" }),
      provenance: items.flatMap((i) => i.sources.map((s) => ({ subjectKey: i.subjectKey, source: s.id }))), generatedAt: now.toISOString() } };
  });
}
