import { randomUUID } from "node:crypto";
import { z } from "zod";
import type pg from "pg";
import type { Queryable } from "../db/pool";
import { withTransaction } from "../db/pool";
import { ApiError, badRequest, conflict, forbidden, tooMany, unauthorized } from "../http/errors";
import type { AuthUser, Router } from "../http/router";
import { parse } from "../http/validate";
import { hashPassword, passwordProblems, randomToken, sha256, sha256Hex, verifyPassword } from "../lib/crypto";
import { APPLE, GOOGLE, OidcError } from "../lib/oidc";
import { audit } from "./audit";
import type { AppDeps } from "./deps";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
const clientSchema = z.enum(["web", "ios", "android", "admin", "unknown"]).default("unknown");
export const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  displayName: z.string().trim().min(1).max(80),
  locale: z.enum(["vi", "en"]).default("vi"),
  client: clientSchema,
}).strict();
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200), client: clientSchema }).strict();
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) }).strict();
export const federatedSchema = z.object({ provider: z.enum(["google", "apple"]), idToken: z.string().min(20).max(8192), displayName: z.string().trim().min(1).max(80).optional(), client: clientSchema }).strict();
export const passwordChangeSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) }).strict();

export type TokenPair = { accessToken: string; refreshToken: string; accessExpiresAt: string; refreshExpiresAt: string; tokenType: "Bearer" };
export type PublicUser = { id: string; email: string; displayName: string; role: string; locale: string; emailVerified: boolean; createdAt: string };

type UserRow = { id: string; email: string; display_name: string; role: AuthUser["role"]; status: AuthUser["status"]; locale: string; email_verified: boolean; created_at: Date; password_hash: string | null; trust_score: number };

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role, locale: row.locale, emailVerified: row.email_verified, createdAt: row.created_at.toISOString() };
}

async function issueSession(q: Queryable, deps: AppDeps, userId: string, client: string, familyId: string = randomUUID()): Promise<TokenPair> {
  const now = deps.now().getTime();
  const accessToken = randomToken("rat");
  const refreshToken = randomToken("rrt");
  const accessExpiresAt = new Date(now + deps.config.accessTokenTtlMs);
  const refreshExpiresAt = new Date(now + deps.config.refreshTokenTtlMs);
  await q.query(
    `INSERT INTO sessions (user_id, family_id, access_token_hash, refresh_token_hash, access_expires_at, refresh_expires_at, client)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, familyId, sha256(accessToken), sha256(refreshToken), accessExpiresAt, refreshExpiresAt, client],
  );
  return { accessToken, refreshToken, accessExpiresAt: accessExpiresAt.toISOString(), refreshExpiresAt: refreshExpiresAt.toISOString(), tokenType: "Bearer" };
}

export function createIdentityService(deps: AppDeps) {
  const { db } = deps;

  async function authenticate(accessToken: string): Promise<AuthUser | null> {
    const { rows } = await db.query<{ session_id: string; id: string; role: AuthUser["role"]; status: AuthUser["status"]; trust_score: number }>(
      `SELECT s.id AS session_id, u.id, u.role, u.status, u.trust_score
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.access_token_hash = $1 AND s.revoked_at IS NULL AND s.rotated_at IS NULL AND s.access_expires_at > $2`,
      [sha256(accessToken), deps.now()],
    );
    const r = rows[0];
    return r ? { id: r.id, role: r.role, status: r.status, sessionId: r.session_id, trustScore: r.trust_score } : null;
  }

  async function register(input: z.infer<typeof registerSchema>, requestId?: string) {
    const problems = passwordProblems(input.password, input.email);
    if (problems.length) throw badRequest("WEAK_PASSWORD", problems.map((code) => ({ path: "password", code })));
    const passwordHash = await hashPassword(input.password);
    return withTransaction(db, async (client) => {
      let row: UserRow;
      try {
        const inserted = await client.query<UserRow>(
          `INSERT INTO users (email, password_hash, display_name, locale) VALUES ($1,$2,$3,$4) RETURNING *`,
          [input.email, passwordHash, input.displayName, input.locale]);
        row = inserted.rows[0]!;
      } catch (e) {
        // Do not reveal whether the address exists beyond the conflict code required by the UI.
        if ((e as { code?: string }).code === "23505") throw conflict("EMAIL_ALREADY_REGISTERED");
        throw e;
      }
      await client.query("INSERT INTO user_preferences (user_id) VALUES ($1)", [row.id]);
      const tokens = await issueSession(client, deps, row.id, input.client);
      await audit(client, { actor: { id: row.id, role: "user" }, action: "account.register", targetType: "USER", targetId: row.id, ...(requestId ? { requestId } : {}) });
      return { user: toPublicUser(row), tokens };
    });
  }

  async function login(input: z.infer<typeof loginSchema>, clientKey: string, requestId?: string) {
    // Per-account throttle (independent of IP) so credential stuffing across many IPs is still slowed.
    const accountKey = `login-fail:${sha256Hex(input.email)}`;
    const ipKey = `login-ip:${clientKey}`;
    const ipDecision = await deps.rateLimits.hit(ipKey, 20 * deps.config.routeRateLimitScale, 15 * 60_000);
    if (!ipDecision.allowed) throw tooMany((ipDecision.resetAt - Date.now()) / 1000, "TOO_MANY_LOGIN_ATTEMPTS");
    const { rows } = await db.query<UserRow>("SELECT * FROM users WHERE lower(email) = $1", [input.email]);
    const user = rows[0];
    const ok = await verifyPassword(input.password, user?.password_hash ?? null);
    if (!user || !ok) {
      const decision = await deps.rateLimits.hit(accountKey, 8, 15 * 60_000);
      if (!decision.allowed) throw tooMany((decision.resetAt - Date.now()) / 1000, "TOO_MANY_LOGIN_ATTEMPTS");
      if (user) await audit(db, { actor: null, action: "auth.login_failed", targetType: "USER", targetId: user.id, ...(requestId ? { requestId } : {}) });
      throw unauthorized("INVALID_CREDENTIALS");
    }
    if (user.status !== "active") throw forbidden("ACCOUNT_NOT_ACTIVE");
    const tokens = await withTransaction(db, async (client) => {
      await client.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
      const t = await issueSession(client, deps, user.id, input.client);
      await audit(client, { actor: { id: user.id, role: user.role }, action: "auth.login", targetType: "USER", targetId: user.id, detail: { client: input.client }, ...(requestId ? { requestId } : {}) });
      return t;
    });
    return { user: toPublicUser(user), tokens };
  }

  async function refresh(refreshToken: string, requestId?: string): Promise<TokenPair> {
    // The family revocation must COMMIT even though the request fails, so the outcome is returned, not thrown.
    const outcome = await withTransaction(db, async (client): Promise<TokenPair | { error: "INVALID" | "REVOKED" | "EXPIRED" | "INACTIVE" }> => {
      const { rows } = await client.query<{ id: string; user_id: string; family_id: string; rotated_at: Date | null; revoked_at: Date | null; refresh_expires_at: Date; client: string; status: string; role: AuthUser["role"] }>(
        `SELECT s.*, u.status, u.role FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.refresh_token_hash = $1 FOR UPDATE OF s`, [sha256(refreshToken)]);
      const s = rows[0];
      if (!s) return { error: "INVALID" };
      if (s.rotated_at || s.revoked_at) {
        // Reuse of a consumed refresh token: assume theft and revoke the entire family.
        if (s.rotated_at && !s.revoked_at) {
          await client.query(`UPDATE sessions SET revoked_at = now(), revoke_reason = 'REFRESH_REUSE' WHERE family_id = $1 AND revoked_at IS NULL`, [s.family_id]);
          await audit(client, { actor: { id: s.user_id, role: s.role }, action: "auth.refresh_reuse_detected", targetType: "SESSION_FAMILY", targetId: s.family_id, ...(requestId ? { requestId } : {}) });
        }
        return { error: "REVOKED" };
      }
      if (s.refresh_expires_at <= deps.now()) return { error: "EXPIRED" };
      if (s.status !== "active") return { error: "INACTIVE" };
      await client.query("UPDATE sessions SET rotated_at = now() WHERE id = $1", [s.id]);
      return issueSession(client, deps, s.user_id, s.client, s.family_id);
    });
    if ("error" in outcome) {
      if (outcome.error === "INACTIVE") throw forbidden("ACCOUNT_NOT_ACTIVE");
      throw unauthorized(outcome.error === "INVALID" ? "INVALID_REFRESH_TOKEN" : outcome.error === "REVOKED" ? "REFRESH_TOKEN_REVOKED" : "REFRESH_TOKEN_EXPIRED");
    }
    return outcome;
  }

  async function revokeSession(user: AuthUser, scope: "current" | "all", requestId?: string) {
    if (scope === "current") {
      const { rows } = await db.query<{ family_id: string }>("SELECT family_id FROM sessions WHERE id = $1", [user.sessionId]);
      await db.query(`UPDATE sessions SET revoked_at = now(), revoke_reason = 'LOGOUT' WHERE family_id = $1 AND revoked_at IS NULL`, [rows[0]?.family_id]);
    } else {
      await db.query(`UPDATE sessions SET revoked_at = now(), revoke_reason = 'LOGOUT_ALL' WHERE user_id = $1 AND revoked_at IS NULL`, [user.id]);
    }
    await audit(db, { actor: user, action: scope === "all" ? "auth.logout_all" : "auth.logout", targetType: "USER", targetId: user.id, ...(requestId ? { requestId } : {}) });
  }

  async function federated(input: z.infer<typeof federatedSchema>, requestId?: string) {
    const flag = await db.query<{ enabled: boolean }>("SELECT enabled FROM feature_flags WHERE key = $1", [`${input.provider}_sign_in`]);
    const audiences = input.provider === "google" ? deps.config.oidc.googleClientIds : deps.config.oidc.appleClientIds;
    if (!flag.rows[0]?.enabled || !audiences.length) throw new ApiError(503, "PROVIDER_NOT_CONFIGURED");
    let identity;
    try {
      identity = await deps.verifyIdToken(input.idToken, { ...(input.provider === "google" ? GOOGLE : APPLE), audiences });
    } catch (e) {
      throw unauthorized(e instanceof OidcError ? `ID_TOKEN_${e.message}` : "ID_TOKEN_INVALID");
    }
    return withTransaction(db, async (client) => {
      const linked = await client.query<UserRow>(
        `SELECT u.* FROM federated_identities f JOIN users u ON u.id = f.user_id WHERE f.provider = $1 AND f.subject = $2`,
        [identity.provider, identity.subject]);
      let user = linked.rows[0];
      if (!user) {
        // Only link to an existing password account if the provider asserts a verified email.
        if (!identity.email || !identity.emailVerified) throw unauthorized("VERIFIED_EMAIL_REQUIRED");
        const existing = await client.query<UserRow>("SELECT * FROM users WHERE lower(email) = lower($1)", [identity.email]);
        user = existing.rows[0];
        if (!user) {
          const created = await client.query<UserRow>(
            `INSERT INTO users (email, email_verified, display_name) VALUES ($1, true, $2) RETURNING *`,
            [identity.email, (input.displayName ?? identity.name ?? identity.email.split("@")[0] ?? "Người dùng").slice(0, 80)]);
          user = created.rows[0]!;
          await client.query("INSERT INTO user_preferences (user_id) VALUES ($1)", [user.id]);
        }
        await client.query("INSERT INTO federated_identities (provider, subject, user_id) VALUES ($1,$2,$3)", [identity.provider, identity.subject, user.id]);
      }
      if (user.status !== "active") throw forbidden("ACCOUNT_NOT_ACTIVE");
      const tokens = await issueSession(client, deps, user.id, input.client);
      await audit(client, { actor: { id: user.id, role: user.role }, action: "auth.federated_login", targetType: "USER", targetId: user.id, detail: { provider: identity.provider }, ...(requestId ? { requestId } : {}) });
      return { user: toPublicUser(user), tokens };
    });
  }

  async function changePassword(user: AuthUser, input: z.infer<typeof passwordChangeSchema>, requestId?: string) {
    const { rows } = await db.query<UserRow>("SELECT * FROM users WHERE id = $1", [user.id]);
    const row = rows[0];
    if (!row || !(await verifyPassword(input.currentPassword, row.password_hash))) throw unauthorized("INVALID_CREDENTIALS");
    const problems = passwordProblems(input.newPassword, row.email);
    if (problems.length) throw badRequest("WEAK_PASSWORD", problems.map((code) => ({ path: "newPassword", code })));
    await withTransaction(db, async (client) => {
      await client.query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1", [user.id, await hashPassword(input.newPassword)]);
      // Every other device must sign in again.
      await client.query(`UPDATE sessions SET revoked_at = now(), revoke_reason = 'PASSWORD_CHANGED' WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`, [user.id, user.sessionId]);
      await audit(client, { actor: user, action: "auth.password_changed", targetType: "USER", targetId: user.id, ...(requestId ? { requestId } : {}) });
    });
  }

  async function listSessions(user: AuthUser) {
    const { rows } = await db.query<{ id: string; client: string; created_at: Date; refresh_expires_at: Date }>(
      `SELECT DISTINCT ON (family_id) id, client, created_at, refresh_expires_at FROM sessions
        WHERE user_id = $1 AND revoked_at IS NULL AND rotated_at IS NULL AND refresh_expires_at > now()
        ORDER BY family_id, created_at DESC`, [user.id]);
    return rows.map((r) => ({ id: r.id, client: r.client, createdAt: r.created_at.toISOString(), expiresAt: r.refresh_expires_at.toISOString(), current: r.id === user.sessionId }));
  }

  return { authenticate, register, login, refresh, revokeSession, federated, changePassword, listSessions };
}

export type IdentityService = ReturnType<typeof createIdentityService>;

export function registerIdentityRoutes(router: Router, identity: IdentityService) {
  const authLimit = { name: "auth", limit: 20, windowMs: 15 * 60_000 };
  router.post("/v1/auth/register", async (ctx) => {
    const result = await identity.register(parse(registerSchema, ctx.body), ctx.requestId);
    return { status: 201, body: result };
  }, { rateLimit: { name: "register", limit: 5, windowMs: 60 * 60_000 } });
  router.post("/v1/auth/login", async (ctx) => ({ body: await identity.login(parse(loginSchema, ctx.body), ctx.clientKey, ctx.requestId) }), { rateLimit: authLimit });
  router.post("/v1/auth/refresh", async (ctx) => ({ body: { tokens: await identity.refresh(parse(refreshSchema, ctx.body).refreshToken, ctx.requestId) } }), { rateLimit: { name: "refresh", limit: 60, windowMs: 15 * 60_000 } });
  router.post("/v1/auth/federated", async (ctx) => ({ body: await identity.federated(parse(federatedSchema, ctx.body), ctx.requestId) }), { rateLimit: authLimit });
  router.post("/v1/auth/logout", async (ctx) => { await identity.revokeSession(ctx.user!, "current", ctx.requestId); return { status: 204 }; }, { auth: "user" });
  router.post("/v1/auth/logout-all", async (ctx) => { await identity.revokeSession(ctx.user!, "all", ctx.requestId); return { status: 204 }; }, { auth: "user" });
  router.post("/v1/auth/password", async (ctx) => { await identity.changePassword(ctx.user!, parse(passwordChangeSchema, ctx.body), ctx.requestId); return { status: 204 }; }, { auth: "user", rateLimit: authLimit });
  router.get("/v1/auth/sessions", async (ctx) => ({ body: { items: await identity.listSessions(ctx.user!) } }), { auth: "user" });
}

export type { pg };
