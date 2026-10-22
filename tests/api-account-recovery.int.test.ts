import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OutboxMailer, UnavailableMailer } from "../apps/api/src/lib/mailer";
import { ExpoPushSender } from "../apps/api/src/lib/push";
import { dispatchPendingPushes } from "../apps/api/src/modules/push-dispatch";
import { hasTestDatabase, registerUser, startHarness, type Harness } from "./helpers/api-harness";

const tokenFrom = (text: string, path: string) => {
  const m = new RegExp(`${path}\\?token=([^\\s]+)`).exec(text);
  if (!m) throw new Error(`no ${path} link in mail`);
  return decodeURIComponent(m[1]!);
};

describe.skipIf(!hasTestDatabase)("Account recovery: email verification, password reset, push delivery (PostGIS)", () => {
  let h: Harness;
  let outbox: OutboxMailer;
  beforeAll(async () => { h = await startHarness(); outbox = h.deps.mailer as OutboxMailer; });
  afterAll(async () => { await h?.close(); });
  const mailsTo = (to: string, tag: string) => outbox.sent.filter((m) => m.to === to && m.tag === tag);

  it("capabilities state truthfully what is available", async () => {
    const r = await h.request("GET", "/v1/auth/capabilities");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ emailDelivery: true, passwordReset: true, emailVerification: true, federated: { google: false, apple: false }, push: false });
  });

  it("registration sends a single-use, expiring verification link; confirming verifies the email", async () => {
    const reg = await h.request("POST", "/v1/auth/register", { body: { email: "verify@example.test", password: "a long enough passphrase", displayName: "V" } });
    expect(reg.status).toBe(201);
    expect(reg.body.verificationEmail).toBe("SENT");
    expect(reg.body.user.emailVerified).toBe(false);
    const [mail] = mailsTo("verify@example.test", "verify-email");
    const token = tokenFrom(mail!.text, "/xac-minh-email");
    const stored = await h.db.query("SELECT token_hash FROM email_tokens WHERE purpose = 'VERIFY_EMAIL'");
    expect(JSON.stringify(stored.rows)).not.toContain(token); // only the hash is stored

    const ok = await h.request("POST", "/v1/auth/email/verify/confirm", { body: { token } });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("VERIFIED");
    const me = await h.request("GET", "/v1/me", { token: reg.body.tokens.accessToken });
    expect(me.body.user?.emailVerified ?? me.body.emailVerified).toBe(true);
    const again = await h.request("POST", "/v1/auth/email/verify/confirm", { body: { token } });
    expect(again.status).toBe(400);
    expect(again.body.error).toBe("TOKEN_INVALID");
    const resend = await h.request("POST", "/v1/auth/email/verify/request", { token: reg.body.tokens.accessToken });
    expect(resend.status).toBe(202);
    expect(resend.body.status).toBe("ALREADY_VERIFIED");
  });

  it("verification links expire after 24 h and a resend voids the previous link", async () => {
    const u = await registerUser(h, { email: "expire@example.test" });
    const first = tokenFrom(mailsTo("expire@example.test", "verify-email")[0]!.text, "/xac-minh-email");
    const resend = await h.request("POST", "/v1/auth/email/verify/request", { token: u.token });
    expect(resend.status).toBe(202);
    const second = tokenFrom(mailsTo("expire@example.test", "verify-email")[1]!.text, "/xac-minh-email");
    expect((await h.request("POST", "/v1/auth/email/verify/confirm", { body: { token: first } })).body.error).toBe("TOKEN_INVALID");
    h.clock.advance(24 * 3_600_000 + 1000);
    expect((await h.request("POST", "/v1/auth/email/verify/confirm", { body: { token: second } })).body.error).toBe("TOKEN_EXPIRED");
  });

  it("forgot-password never reveals whether an account exists", async () => {
    await registerUser(h, { email: "exists@example.test" });
    const before = outbox.sent.length;
    const a = await h.request("POST", "/v1/auth/password/forgot", { body: { email: "exists@example.test" } });
    const b = await h.request("POST", "/v1/auth/password/forgot", { body: { email: "nobody@example.test" } });
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    expect(a.body).toEqual(b.body);
    expect(outbox.sent.length).toBe(before + 1);
    expect(outbox.sent.at(-1)!.to).toBe("exists@example.test");
  });

  it("reset sets a new password, revokes every session, verifies the email and notifies the owner; tokens are single-use and expire", async () => {
    const u = await registerUser(h, { email: "reset@example.test", password: "original passphrase here" });
    await h.request("POST", "/v1/auth/password/forgot", { body: { email: "reset@example.test" } });
    const token = tokenFrom(mailsTo("reset@example.test", "reset-password").at(-1)!.text, "/dat-lai-mat-khau");

    const weak = await h.request("POST", "/v1/auth/password/reset", { body: { token, newPassword: "password123" } });
    expect(weak.body.error).toBe("WEAK_PASSWORD");
    const ok = await h.request("POST", "/v1/auth/password/reset", { body: { token, newPassword: "brand new passphrase 42" } });
    expect(ok.status).toBe(204);
    expect((await h.request("GET", "/v1/me", { token: u.token })).status).toBe(401); // all sessions revoked
    expect((await h.request("POST", "/v1/auth/login", { body: { email: "reset@example.test", password: "original passphrase here" } })).status).toBe(401);
    const login = await h.request("POST", "/v1/auth/login", { body: { email: "reset@example.test", password: "brand new passphrase 42" } });
    expect(login.status).toBe(200);
    expect(login.body.user.emailVerified).toBe(true);
    expect(mailsTo("reset@example.test", "password-changed")).toHaveLength(1);
    expect((await h.request("POST", "/v1/auth/password/reset", { body: { token, newPassword: "another passphrase 77" } })).body.error).toBe("TOKEN_INVALID");

    await h.request("POST", "/v1/auth/password/forgot", { body: { email: "reset@example.test" } });
    const late = tokenFrom(mailsTo("reset@example.test", "reset-password").at(-1)!.text, "/dat-lai-mat-khau");
    h.clock.advance(31 * 60_000);
    expect((await h.request("POST", "/v1/auth/password/reset", { body: { token: late, newPassword: "another passphrase 77" } })).body.error).toBe("TOKEN_EXPIRED");
    const audit = await h.db.query("SELECT action FROM audit_events WHERE action LIKE 'auth.password_reset' OR action LIKE 'mail.%'");
    expect(audit.rows.map((r) => r.action)).toContain("auth.password_reset");
    expect(JSON.stringify(audit.rows)).not.toContain("reset@example.test");
  });

  it("a reset token stops working if the account email changed after issuance", async () => {
    await registerUser(h, { email: "moved@example.test" });
    await h.request("POST", "/v1/auth/password/forgot", { body: { email: "moved@example.test" } });
    const token = tokenFrom(mailsTo("moved@example.test", "reset-password").at(-1)!.text, "/dat-lai-mat-khau");
    await h.db.query("UPDATE users SET email = 'moved-new@example.test' WHERE email = 'moved@example.test'");
    expect((await h.request("POST", "/v1/auth/password/reset", { body: { token, newPassword: "brand new passphrase 42" } })).body.error).toBe("TOKEN_INVALID");
  });

  it("changing the password notifies the account owner", async () => {
    const u = await registerUser(h, { email: "change@example.test", password: "first long passphrase" });
    const r = await h.request("POST", "/v1/auth/password", { token: u.token, body: { currentPassword: "first long passphrase", newPassword: "second long passphrase" } });
    expect(r.status).toBe(204);
    expect(mailsTo("change@example.test", "password-changed")).toHaveLength(1);
  });

  it("push: notifications are pushed only with consent, high priority for safety-critical, and dead tokens are disabled", async () => {
    const u = await registerUser(h, { email: "push@example.test" });
    const sentBodies: unknown[] = [];
    const transport = (async (_url: string, init: RequestInit) => {
      const msgs = JSON.parse(String(init.body)) as Array<{ to: string; priority: string }>;
      sentBodies.push(...msgs);
      return new Response(JSON.stringify({ data: msgs.map((m) => m.to.includes("Dead") ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "x" }) }), { status: 200 });
    }) as unknown as typeof fetch;
    const push = new ExpoPushSender({ transport });
    // No consent → token registration refused.
    expect((await h.request("POST", "/v1/me/push-tokens", { token: u.token, body: { token: "ExponentPushToken[aliveToken123]", platform: "android" } })).body.error).toBe("NOTIFICATION_CONSENT_REQUIRED");
    await h.request("POST", "/v1/me/consents", { token: u.token, body: { purpose: "notifications", granted: true } });
    expect((await h.request("POST", "/v1/me/push-tokens", { token: u.token, body: { token: "ExponentPushToken[aliveToken123]", platform: "android" } })).status).toBe(204);
    expect((await h.request("POST", "/v1/me/push-tokens", { token: u.token, body: { token: "ExponentPushToken[DeadToken12345]", platform: "ios" } })).status).toBe(204);
    await h.db.query(`INSERT INTO notifications (user_id, kind, severity, title, body, dedupe_key, created_at) VALUES ($1,'WATCH_CHANGE','SAFETY_CRITICAL','Ngập sâu','Đường bị ngập sâu', 'k1', $2)`, [u.id, h.clock.now]);
    const r = await dispatchPendingPushes(h.db, push, h.clock.now);
    expect(r).toMatchObject({ notifications: 1, sent: 1, failed: 1, disabledTokens: 1 });
    expect(sentBodies.every((m) => (m as { priority: string }).priority === "high")).toBe(true);
    expect(JSON.stringify(sentBodies)).not.toMatch(/latitude|longitude|lat|lng/);
    const second = await dispatchPendingPushes(h.db, push, h.clock.now);
    expect(second.notifications).toBe(0); // marked pushed, never re-sent
    const tokens = await h.db.query("SELECT token, disabled_reason FROM push_tokens WHERE user_id = $1 ORDER BY token", [u.id]);
    expect(tokens.rows.find((t) => t.token.includes("Dead")).disabled_reason).toBe("DeviceNotRegistered");
    // Quiet hours (22–24 Vietnam time) hold back non-critical pushes but not safety-critical ones.
    await h.db.query("UPDATE user_preferences SET quiet_hours = int4range(22, 24) WHERE user_id = $1", [u.id]);
    const night = new Date("2026-10-22T15:30:00Z"); // 22:30 in Hà Nội
    await h.db.query(`INSERT INTO notifications (user_id, kind, severity, title, body, dedupe_key, created_at) VALUES ($1,'WATCH_CHANGE','SIGNIFICANT','q','q','kq1',$2), ($1,'WATCH_CHANGE','SAFETY_CRITICAL','c','c','kq2',$2)`, [u.id, night]);
    const quiet = await dispatchPendingPushes(h.db, push, night);
    expect(quiet).toMatchObject({ notifications: 2, sent: 1 });
    const held = await h.db.query("SELECT push_error FROM notifications WHERE dedupe_key = 'kq1'");
    expect(held.rows[0].push_error).toBe("QUIET_HOURS");
    // Revoking consent deletes tokens; later notifications are not pushed.
    await h.request("POST", "/v1/me/consents", { token: u.token, body: { purpose: "notifications", granted: false } });
    await h.db.query(`INSERT INTO notifications (user_id, kind, severity, title, body, dedupe_key, created_at) VALUES ($1,'WATCH_CHANGE','SIGNIFICANT','x','y','k2',$2)`, [u.id, h.clock.now]);
    expect((await dispatchPendingPushes(h.db, push, h.clock.now)).notifications).toBe(0);
  });
});

describe.skipIf(!hasTestDatabase)("Account recovery without a mail transport (PostGIS)", () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness({ overrides: { mailer: new UnavailableMailer() } }); });
  afterAll(async () => { await h?.close(); });

  it("never claims an email was sent", async () => {
    const caps = await h.request("GET", "/v1/auth/capabilities");
    expect(caps.body.emailDelivery).toBe(false);
    const reg = await h.request("POST", "/v1/auth/register", { body: { email: "nomail@example.test", password: "a long enough passphrase", displayName: "N" } });
    expect(reg.status).toBe(201);
    expect(reg.body.verificationEmail).toBe("UNAVAILABLE");
    const forgot = await h.request("POST", "/v1/auth/password/forgot", { body: { email: "nomail@example.test" } });
    expect(forgot.status).toBe(503);
    expect(forgot.body.error).toBe("EMAIL_DELIVERY_UNAVAILABLE");
    const verify = await h.request("POST", "/v1/auth/email/verify/request", { token: reg.body.tokens.accessToken });
    expect(verify.status).toBe(503);
  });
});
