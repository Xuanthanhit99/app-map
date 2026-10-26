import { z } from "zod";
import { withTransaction } from "../db/pool";
import { ApiError, badRequest, tooMany } from "../http/errors";
import type { AuthUser, Router } from "../http/router";
import { parse } from "../http/validate";
import { hashPassword, passwordProblems, randomToken, sha256, sha256Hex } from "../lib/crypto";
import type { MailMessage } from "../lib/mailer";
import { audit } from "./audit";
import type { AppDeps } from "./deps";
import { emailSchema } from "./identity";

/**
 * Email verification, password reset and account recovery.
 *
 * - Tokens: 32 random bytes, SHA-256 stored, single use, bound to the email they were sent to.
 * - Verification links live 24 h; reset links 30 min. Issuing a new token voids older unused ones.
 * - "Forgot password" always answers 202 with the same body whether or not the account exists
 *   (no account enumeration); per-IP and per-address limits apply silently.
 * - A completed reset revokes every session, marks the email verified (inbox control proven)
 *   and sends a "your password was changed" notice.
 * - Without a mail transport the endpoints answer 503 EMAIL_DELIVERY_UNAVAILABLE: the product
 *   never claims an email was sent when it cannot be.
 */
export const VERIFY_TTL_MS = 24 * 3_600_000;
export const RESET_TTL_MS = 30 * 60_000;

export const tokenSchema = z.object({ token: z.string().min(20).max(200) }).strict();
export const forgotSchema = z.object({ email: emailSchema }).strict();
export const resetSchema = z.object({ token: z.string().min(20).max(200), newPassword: z.string().min(1).max(200) }).strict();

type Purpose = "VERIFY_EMAIL" | "RESET_PASSWORD";

function verifyMail(to: string, name: string, link: string): MailMessage {
  return {
    to, tag: "verify-email",
    subject: "Xác minh email cho tài khoản REALITY",
    text: `Chào ${name},\n\nHãy xác minh địa chỉ email của bạn bằng cách mở liên kết sau (hiệu lực 24 giờ):\n${link}\n\nNếu bạn không tạo tài khoản REALITY, hãy bỏ qua email này.\n`,
  };
}
function resetMail(to: string, name: string, link: string): MailMessage {
  return {
    to, tag: "reset-password",
    subject: "Đặt lại mật khẩu REALITY",
    text: `Chào ${name},\n\nCó yêu cầu đặt lại mật khẩu cho tài khoản này. Mở liên kết sau để đặt mật khẩu mới (hiệu lực 30 phút, chỉ dùng một lần):\n${link}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.\n`,
  };
}
function changedMail(to: string, name: string, link: string): MailMessage {
  return {
    to, tag: "password-changed",
    subject: "Mật khẩu REALITY của bạn vừa được thay đổi",
    text: `Chào ${name},\n\nMật khẩu tài khoản REALITY của bạn vừa được thay đổi và mọi phiên đăng nhập khác đã được đăng xuất.\nNếu không phải bạn, hãy đặt lại mật khẩu ngay: ${link}\n`,
  };
}

export function createAccountRecoveryService(deps: AppDeps) {
  const { db, mailer, config } = deps;
  const web = config.publicWebUrl;

  function requireMail() {
    if (!mailer.available) throw new ApiError(503, "EMAIL_DELIVERY_UNAVAILABLE");
  }

  async function issue(userId: string, email: string, purpose: Purpose): Promise<string> {
    const token = randomToken(purpose === "VERIFY_EMAIL" ? "rve" : "rrp");
    const now = deps.now();
    await withTransaction(db, async (c) => {
      await c.query("UPDATE email_tokens SET used_at = $3 WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL", [userId, purpose, now]);
      await c.query("INSERT INTO email_tokens (user_id, purpose, token_hash, email, created_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [userId, purpose, sha256(token), email.toLowerCase(), now, new Date(now.getTime() + (purpose === "VERIFY_EMAIL" ? VERIFY_TTL_MS : RESET_TTL_MS))]);
    });
    return token;
  }

  /** Best-effort delivery after a committed state change: failures are audited, never leak the address. */
  async function deliver(message: MailMessage, userId: string, requestId?: string) {
    try {
      await mailer.send(message);
      await audit(db, { actor: null, action: `mail.sent.${message.tag}`, targetType: "USER", targetId: userId, ...(requestId ? { requestId } : {}) });
      return true;
    } catch (e) {
      await audit(db, { actor: null, action: `mail.failed.${message.tag}`, targetType: "USER", targetId: userId, detail: { error: (e as Error).message.slice(0, 80) }, ...(requestId ? { requestId } : {}) });
      return false;
    }
  }

  async function sendVerification(userId: string, requestId?: string): Promise<{ sent: boolean; alreadyVerified?: boolean }> {
    const { rows } = await db.query<{ email: string; display_name: string; email_verified: boolean; status: string }>("SELECT email, display_name, email_verified, status FROM users WHERE id = $1", [userId]);
    const u = rows[0];
    if (!u || u.status !== "active") return { sent: false };
    if (u.email_verified) return { sent: false, alreadyVerified: true };
    if (!mailer.available) return { sent: false };
    const token = await issue(userId, u.email, "VERIFY_EMAIL");
    const sent = await deliver(verifyMail(u.email, u.display_name, `${web}/xac-minh-email?token=${encodeURIComponent(token)}`), userId, requestId);
    return { sent };
  }

  async function requestVerification(user: AuthUser, requestId?: string) {
    requireMail();
    const d = await deps.rateLimits.hit(`verify-mail:${user.id}`, 3, 60 * 60_000);
    if (!d.allowed) throw tooMany((d.resetAt - Date.now()) / 1000, "TOO_MANY_VERIFICATION_EMAILS");
    const r = await sendVerification(user.id, requestId);
    if (r.alreadyVerified) return { status: "ALREADY_VERIFIED" as const };
    if (!r.sent) throw new ApiError(502, "EMAIL_SEND_FAILED");
    return { status: "SENT" as const };
  }

  async function confirmVerification(token: string, requestId?: string) {
    const result = await withTransaction(db, async (c) => {
      const { rows } = await c.query<{ id: string; user_id: string; email: string; expires_at: Date; used_at: Date | null; current_email: string; status: string }>(
        `SELECT t.id, t.user_id, t.email, t.expires_at, t.used_at, lower(u.email) AS current_email, u.status
           FROM email_tokens t JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = $1 AND t.purpose = 'VERIFY_EMAIL' FOR UPDATE OF t`, [sha256(token)]);
      const t = rows[0];
      if (!t || t.used_at || t.email !== t.current_email) return "TOKEN_INVALID" as const;
      if (t.expires_at <= deps.now()) return "TOKEN_EXPIRED" as const;
      await c.query("UPDATE email_tokens SET used_at = $2 WHERE id = $1", [t.id, deps.now()]);
      await c.query("UPDATE users SET email_verified = true, email_verified_at = COALESCE(email_verified_at, $2), updated_at = now() WHERE id = $1", [t.user_id, deps.now()]);
      await audit(c, { actor: { id: t.user_id, role: "user" }, action: "account.email_verified", targetType: "USER", targetId: t.user_id, ...(requestId ? { requestId } : {}) });
      return "VERIFIED" as const;
    });
    if (result !== "VERIFIED") throw badRequest(result);
    return { status: result };
  }

  async function forgot(email: string, clientKey: string, requestId?: string) {
    requireMail();
    const ip = await deps.rateLimits.hit(`forgot-ip:${clientKey}`, 10 * config.routeRateLimitScale, 60 * 60_000);
    if (!ip.allowed) throw tooMany((ip.resetAt - Date.now()) / 1000, "TOO_MANY_RESET_REQUESTS");
    // Per-address limit is silent so the response never reveals whether the address exists.
    const perAddress = await deps.rateLimits.hit(`forgot-addr:${sha256Hex(email)}`, 3, 60 * 60_000);
    if (perAddress.allowed) {
      const { rows } = await db.query<{ id: string; email: string; display_name: string; status: string }>("SELECT id, email, display_name, status FROM users WHERE lower(email) = $1", [email]);
      const u = rows[0];
      if (u && u.status === "active") {
        const token = await issue(u.id, u.email, "RESET_PASSWORD");
        await deliver(resetMail(u.email, u.display_name, `${web}/dat-lai-mat-khau?token=${encodeURIComponent(token)}`), u.id, requestId);
      }
    }
    return { status: "ACCEPTED" as const };
  }

  async function reset(input: z.infer<typeof resetSchema>, requestId?: string) {
    const outcome = await withTransaction(db, async (c) => {
      const { rows } = await c.query<{ id: string; user_id: string; email: string; expires_at: Date; used_at: Date | null; current_email: string; status: string; display_name: string; real_email: string }>(
        `SELECT t.id, t.user_id, t.email, t.expires_at, t.used_at, lower(u.email) AS current_email, u.email AS real_email, u.status, u.display_name
           FROM email_tokens t JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = $1 AND t.purpose = 'RESET_PASSWORD' FOR UPDATE OF t`, [sha256(input.token)]);
      const t = rows[0];
      if (!t || t.used_at || t.email !== t.current_email) return { error: "TOKEN_INVALID" as const };
      if (t.expires_at <= deps.now()) return { error: "TOKEN_EXPIRED" as const };
      if (t.status !== "active") return { error: "ACCOUNT_NOT_ACTIVE" as const };
      const problems = passwordProblems(input.newPassword, t.real_email);
      if (problems.length) return { error: "WEAK_PASSWORD" as const, problems };
      await c.query("UPDATE email_tokens SET used_at = $2 WHERE id = $1", [t.id, deps.now()]);
      await c.query("UPDATE email_tokens SET used_at = $2 WHERE user_id = $1 AND purpose = 'RESET_PASSWORD' AND used_at IS NULL", [t.user_id, deps.now()]);
      await c.query(`UPDATE users SET password_hash = $2, email_verified = true, email_verified_at = COALESCE(email_verified_at, $3), updated_at = now() WHERE id = $1`,
        [t.user_id, await hashPassword(input.newPassword), deps.now()]);
      await c.query(`UPDATE sessions SET revoked_at = now(), revoke_reason = 'PASSWORD_RESET' WHERE user_id = $1 AND revoked_at IS NULL`, [t.user_id]);
      await audit(c, { actor: { id: t.user_id, role: "user" }, action: "auth.password_reset", targetType: "USER", targetId: t.user_id, ...(requestId ? { requestId } : {}) });
      return { ok: { userId: t.user_id, email: t.real_email, name: t.display_name } };
    });
    if ("error" in outcome) {
      if (outcome.error === "WEAK_PASSWORD") throw badRequest("WEAK_PASSWORD", outcome.problems.map((code) => ({ path: "newPassword", code })));
      throw badRequest(outcome.error);
    }
    if (mailer.available) await deliver(changedMail(outcome.ok.email, outcome.ok.name, `${web}/quen-mat-khau`), outcome.ok.userId, requestId);
  }

  async function notifyPasswordChanged(userId: string, requestId?: string) {
    if (!mailer.available) return;
    const { rows } = await db.query<{ email: string; display_name: string }>("SELECT email, display_name FROM users WHERE id = $1", [userId]);
    if (rows[0]) await deliver(changedMail(rows[0].email, rows[0].display_name, `${web}/quen-mat-khau`), userId, requestId);
  }

  return { sendVerification, requestVerification, confirmVerification, forgot, reset, notifyPasswordChanged };
}

export type AccountRecoveryService = ReturnType<typeof createAccountRecoveryService>;

export function registerAccountRecoveryRoutes(router: Router, svc: AccountRecoveryService, deps: AppDeps) {
  router.get("/v1/auth/capabilities", async () => {
    const flags = await deps.db.query<{ key: string; enabled: boolean }>("SELECT key, enabled FROM feature_flags WHERE key IN ('google_sign_in','apple_sign_in','push_notifications')");
    const on = (k: string) => flags.rows.some((f) => f.key === k && f.enabled);
    return {
      body: {
        emailDelivery: deps.mailer.available,
        passwordReset: deps.mailer.available,
        emailVerification: deps.mailer.available,
        federated: {
          google: on("google_sign_in") && deps.config.oidc.googleClientIds.length > 0,
          apple: on("apple_sign_in") && deps.config.oidc.appleClientIds.length > 0,
        },
        push: on("push_notifications") && deps.config.push.provider !== "none",
      },
    };
  });
  router.post("/v1/auth/email/verify/request", async (ctx) => ({ status: 202, body: await svc.requestVerification(ctx.user!, ctx.requestId) }), { auth: "user", rateLimit: { name: "verify-request", limit: 10, windowMs: 60 * 60_000 } });
  router.post("/v1/auth/email/verify/confirm", async (ctx) => ({ body: await svc.confirmVerification(parse(tokenSchema, ctx.body).token, ctx.requestId) }), { rateLimit: { name: "verify-confirm", limit: 30, windowMs: 15 * 60_000 } });
  router.post("/v1/auth/password/forgot", async (ctx) => ({ status: 202, body: await svc.forgot(parse(forgotSchema, ctx.body).email, ctx.clientKey, ctx.requestId) }), { rateLimit: { name: "forgot", limit: 10, windowMs: 60 * 60_000 } });
  router.post("/v1/auth/password/reset", async (ctx) => { await svc.reset(parse(resetSchema, ctx.body), ctx.requestId); return { status: 204 }; }, { rateLimit: { name: "reset", limit: 20, windowMs: 15 * 60_000 } });
}
