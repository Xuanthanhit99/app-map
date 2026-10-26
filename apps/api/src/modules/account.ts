import { z } from "zod";
import { withTransaction } from "../db/pool";
import { badRequest, notFound, unauthorized } from "../http/errors";
import type { AuthUser, Router } from "../http/router";
import { parse } from "../http/validate";
import { verifyPassword } from "../lib/crypto";
import { audit } from "./audit";
import type { AppDeps } from "./deps";
import { toPublicUser } from "./identity";

export const CONSENT_PURPOSES = ["location_foreground", "location_background", "context_personalization", "notifications", "analytics", "journey_sharing", "contribution_public"] as const;
export const CURRENT_POLICY_VERSION = "2026-10-22";

export const profileSchema = z.object({ displayName: z.string().trim().min(1).max(80).optional(), locale: z.enum(["vi", "en"]).optional() }).strict();
export const preferencesSchema = z.object({
  travelMode: z.enum(["DRIVING", "WALKING", "CYCLING", "MOTORBIKE"]).optional(),
  accessibilityNeeds: z.array(z.enum(["WHEELCHAIR", "STEP_FREE", "LOW_VISION", "HEARING", "REDUCED_MOBILITY"])).max(5).optional(),
  preferredCategories: z.array(z.string().regex(/^[a-z_]{2,32}$/)).max(12).optional(),
  notifyMinSeverity: z.enum(["INFO", "MINOR", "SIGNIFICANT", "SAFETY_CRITICAL"]).optional(),
  quietHours: z.object({ startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(0).max(24) }).nullable().optional(),
}).strict();
export const consentSchema = z.object({ purpose: z.enum(CONSENT_PURPOSES), granted: z.boolean() }).strict();
export const savedPlaceSchema = z.object({ placeId: z.string().uuid(), label: z.string().trim().max(60).optional() }).strict();
export const deleteSchema = z.object({ password: z.string().max(200).optional(), confirm: z.literal("XOA TAI KHOAN") }).strict();

export async function currentConsents(db: AppDeps["db"], userId: string): Promise<Record<string, { granted: boolean; policyVersion: string; at: string }>> {
  const { rows } = await db.query<{ purpose: string; granted: boolean; policy_version: string; created_at: Date }>(
    `SELECT DISTINCT ON (purpose) purpose, granted, policy_version, created_at FROM consents
      WHERE user_id = $1 ORDER BY purpose, created_at DESC, id DESC`, [userId]);
  return Object.fromEntries(rows.map((r) => [r.purpose, { granted: r.granted, policyVersion: r.policy_version, at: r.created_at.toISOString() }]));
}

/** Consent is only "granted" when the latest ledger entry says so for the current policy version. */
export async function hasConsent(db: AppDeps["db"], userId: string, purpose: typeof CONSENT_PURPOSES[number]): Promise<boolean> {
  const c = (await currentConsents(db, userId))[purpose];
  return Boolean(c?.granted && c.policyVersion === CURRENT_POLICY_VERSION);
}

type PrefRow = { travel_mode: string; accessibility_needs: string[]; preferred_categories: string[]; notify_min_severity: string; quiet_hours: string | null };
function prefsOut(r: PrefRow | undefined) {
  const m = r?.quiet_hours ? /^\[(\d+),(\d+)\)$/.exec(r.quiet_hours) : null;
  return {
    travelMode: r?.travel_mode ?? "DRIVING",
    accessibilityNeeds: r?.accessibility_needs ?? [],
    preferredCategories: r?.preferred_categories ?? [],
    notifyMinSeverity: r?.notify_min_severity ?? "SIGNIFICANT",
    quietHours: m ? { startHour: Number(m[1]), endHour: Number(m[2]) } : null,
  };
}

export function createAccountService(deps: AppDeps) {
  const { db } = deps;
  return {
    async me(user: AuthUser) {
      const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [user.id]);
      if (!rows[0]) throw notFound();
      return { user: toPublicUser(rows[0]), consents: await currentConsents(db, user.id), policyVersion: CURRENT_POLICY_VERSION };
    },
    async updateProfile(user: AuthUser, input: z.infer<typeof profileSchema>) {
      const { rows } = await db.query(
        `UPDATE users SET display_name = COALESCE($2, display_name), locale = COALESCE($3, locale), updated_at = now() WHERE id = $1 RETURNING *`,
        [user.id, input.displayName ?? null, input.locale ?? null]);
      return toPublicUser(rows[0]);
    },
    async preferences(user: AuthUser) {
      const { rows } = await db.query<PrefRow>("SELECT *, quiet_hours::text AS quiet_hours FROM user_preferences WHERE user_id = $1", [user.id]);
      return prefsOut(rows[0]);
    },
    async updatePreferences(user: AuthUser, input: z.infer<typeof preferencesSchema>) {
      if (input.quietHours && input.quietHours.endHour <= input.quietHours.startHour) throw badRequest("INVALID_QUIET_HOURS");
      const quiet = input.quietHours === undefined ? undefined : input.quietHours === null ? null : `[${input.quietHours.startHour},${input.quietHours.endHour})`;
      const { rows } = await db.query<PrefRow>(
        `INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING;`, [user.id]).then(() => db.query<PrefRow>(
        `UPDATE user_preferences SET
           travel_mode = COALESCE($2, travel_mode),
           accessibility_needs = COALESCE($3, accessibility_needs),
           preferred_categories = COALESCE($4, preferred_categories),
           notify_min_severity = COALESCE($5, notify_min_severity),
           quiet_hours = CASE WHEN $6::boolean THEN $7::int4range ELSE quiet_hours END,
           updated_at = now()
         WHERE user_id = $1 RETURNING *, quiet_hours::text AS quiet_hours`,
        [user.id, input.travelMode ?? null, input.accessibilityNeeds ?? null, input.preferredCategories ?? null,
          input.notifyMinSeverity ?? null, quiet !== undefined, quiet ?? null]));
      return prefsOut(rows[0]);
    },
    async setConsent(user: AuthUser, input: z.infer<typeof consentSchema>, requestId: string) {
      await db.query("INSERT INTO consents (user_id, purpose, granted, policy_version) VALUES ($1,$2,$3,$4)",
        [user.id, input.purpose, input.granted, CURRENT_POLICY_VERSION]);
      if (input.purpose === "journey_sharing" && !input.granted) {
        // Revoking sharing consent revokes every live share link immediately.
        await db.query(`UPDATE journey_shares s SET revoked_at = now() FROM journeys j
                         WHERE s.journey_id = j.id AND j.user_id = $1 AND s.revoked_at IS NULL`, [user.id]);
      }
      if (input.purpose === "notifications" && !input.granted) await db.query("DELETE FROM push_tokens WHERE user_id = $1", [user.id]);
      await audit(db, { actor: user, action: "consent.changed", targetType: "USER", targetId: user.id, detail: { purpose: input.purpose, granted: input.granted }, requestId });
      return currentConsents(db, user.id);
    },
    async savedPlaces(user: AuthUser) {
      const { rows } = await db.query(
        `SELECT p.id, p.slug, p.name, p.category, p.address, ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lng, s.label, s.created_at
           FROM saved_places s JOIN places p ON p.id = s.place_id WHERE s.user_id = $1 ORDER BY s.created_at DESC LIMIT 200`, [user.id]);
      return rows.map((r) => ({ placeId: r.id, slug: r.slug, name: r.name, category: r.category, address: r.address, coordinate: [r.lng, r.lat], label: r.label, savedAt: r.created_at.toISOString() }));
    },
    async savePlace(user: AuthUser, input: z.infer<typeof savedPlaceSchema>) {
      const exists = await db.query("SELECT 1 FROM places WHERE id = $1 AND status = 'active'", [input.placeId]);
      if (!exists.rowCount) throw notFound("PLACE_NOT_FOUND");
      const count = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM saved_places WHERE user_id = $1", [user.id]);
      if ((count.rows[0]?.n ?? 0) >= 200) throw badRequest("SAVED_PLACES_LIMIT");
      await db.query(`INSERT INTO saved_places (user_id, place_id, label) VALUES ($1,$2,$3)
                      ON CONFLICT (user_id, place_id) DO UPDATE SET label = EXCLUDED.label`, [user.id, input.placeId, input.label ?? null]);
    },
    async unsavePlace(user: AuthUser, placeId: string) {
      await db.query("DELETE FROM saved_places WHERE user_id = $1 AND place_id = $2", [user.id, placeId]);
    },
    /** Machine-readable copy of everything stored about the user (right of access / portability). */
    async exportData(user: AuthUser, requestId: string) {
      const q = async (sql: string) => (await db.query(sql, [user.id])).rows;
      const data = {
        format: "reality-export/1",
        generatedAt: deps.now().toISOString(),
        user: (await q(`SELECT id, email, email_verified, display_name, role, status, locale, created_at, updated_at, last_login_at FROM users WHERE id = $1`))[0],
        preferences: (await q(`SELECT travel_mode, accessibility_needs, preferred_categories, notify_min_severity, quiet_hours::text FROM user_preferences WHERE user_id = $1`))[0] ?? null,
        consents: await q(`SELECT purpose, granted, policy_version, created_at FROM consents WHERE user_id = $1 ORDER BY created_at`),
        federatedIdentities: await q(`SELECT provider, created_at FROM federated_identities WHERE user_id = $1`),
        sessions: await q(`SELECT client, created_at, refresh_expires_at, revoked_at, revoke_reason FROM sessions WHERE user_id = $1 ORDER BY created_at`),
        savedPlaces: await q(`SELECT place_id, label, created_at FROM saved_places WHERE user_id = $1`),
        watchAreas: await q(`SELECT id, label, kind, ST_AsGeoJSON(geom)::json AS geometry, radius_m, domains, min_severity, active, created_at FROM watch_areas WHERE user_id = $1`),
        journeys: await q(`SELECT id, status, mode, ST_AsGeoJSON(origin)::json AS origin, ST_AsGeoJSON(destination)::json AS destination, destination_label, distance_m, duration_s, route_provider, started_at, ended_at, created_at FROM journeys WHERE user_id = $1`),
        reports: await q(`SELECT id, domain, value, note, ST_AsGeoJSON(geom)::json AS location, status, observed_at, created_at FROM reports WHERE reporter_id = $1`),
        votes: await q(`SELECT report_id, vote, created_at FROM report_votes WHERE voter_id = $1`),
        stories: await q(`SELECT id, slug, title, status, created_at FROM stories WHERE author_id = $1`),
        notifications: await q(`SELECT kind, severity, title, body, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at`),
      };
      await audit(db, { actor: user, action: "account.export", targetType: "USER", targetId: user.id, requestId });
      return data;
    },
    /**
     * Erasure: the user row and everything owned by it is deleted (FK cascades). Community reports are
     * kept for safety history but detached from the person and stripped of free text.
     */
    async deleteAccount(user: AuthUser, input: z.infer<typeof deleteSchema>, requestId: string) {
      const { rows } = await db.query<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = $1", [user.id]);
      const hash = rows[0]?.password_hash ?? null;
      if (hash && !(await verifyPassword(input.password ?? "", hash))) throw unauthorized("INVALID_CREDENTIALS");
      await withTransaction(db, async (client) => {
        await client.query("UPDATE reports SET note = NULL, reporter_id = NULL WHERE reporter_id = $1", [user.id]);
        await client.query("UPDATE stories SET author_id = NULL WHERE author_id = $1 AND status = 'PUBLISHED'", [user.id]);
        await client.query("DELETE FROM stories WHERE author_id = $1", [user.id]);
        await client.query("DELETE FROM users WHERE id = $1", [user.id]);
        await audit(client, { actor: { id: user.id, role: user.role }, action: "account.deleted", targetType: "USER", targetId: user.id, requestId });
      });
    },
  };
}

export function registerAccountRoutes(router: Router, deps: AppDeps) {
  const svc = createAccountService(deps);
  router.get("/v1/me", async (ctx) => ({ body: await svc.me(ctx.user!) }), { auth: "user" });
  router.patch("/v1/me", async (ctx) => ({ body: { user: await svc.updateProfile(ctx.user!, parse(profileSchema, ctx.body)) } }), { auth: "user" });
  router.get("/v1/me/preferences", async (ctx) => ({ body: await svc.preferences(ctx.user!) }), { auth: "user" });
  router.put("/v1/me/preferences", async (ctx) => ({ body: await svc.updatePreferences(ctx.user!, parse(preferencesSchema, ctx.body)) }), { auth: "user" });
  router.get("/v1/me/consents", async (ctx) => ({ body: { policyVersion: CURRENT_POLICY_VERSION, consents: await currentConsents(deps.db, ctx.user!.id) } }), { auth: "user" });
  router.post("/v1/me/consents", async (ctx) => ({ body: { policyVersion: CURRENT_POLICY_VERSION, consents: await svc.setConsent(ctx.user!, parse(consentSchema, ctx.body), ctx.requestId) } }), { auth: "user" });
  router.get("/v1/me/saved-places", async (ctx) => ({ body: { items: await svc.savedPlaces(ctx.user!) } }), { auth: "user" });
  router.post("/v1/me/saved-places", async (ctx) => { await svc.savePlace(ctx.user!, parse(savedPlaceSchema, ctx.body)); return { status: 204 }; }, { auth: "user" });
  router.delete("/v1/me/saved-places/:placeId", async (ctx) => { await svc.unsavePlace(ctx.user!, parse(z.string().uuid(), ctx.params.placeId)); return { status: 204 }; }, { auth: "user" });
  router.get("/v1/me/export", async (ctx) => ({ body: await svc.exportData(ctx.user!, ctx.requestId), headers: { "Content-Disposition": 'attachment; filename="reality-export.json"' } }), { auth: "user", rateLimit: { name: "export", limit: 5, windowMs: 3_600_000 } });
  router.post("/v1/me/delete", async (ctx) => { await svc.deleteAccount(ctx.user!, parse(deleteSchema, ctx.body), ctx.requestId); return { status: 204 }; }, { auth: "user", rateLimit: { name: "delete", limit: 5, windowMs: 3_600_000 } });
}
