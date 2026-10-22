import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../apps/api/src/config";

const base = { DATABASE_URL: "postgres://x@localhost/db" };
const load = (env: Record<string, string>) => loadConfig({ ...base, ...env } as unknown as NodeJS.ProcessEnv);

describe("mail and push configuration safeguards", () => {
  it("defaults to no mail and no push (features report unavailable)", () => {
    const c = load({ APP_ENV: "qa" });
    expect(c.mail.transport).toBe("none");
    expect(c.push.provider).toBe("none");
  });
  it("refuses the in-memory outbox in qa and production", () => {
    expect(() => load({ APP_ENV: "qa", MAIL_TRANSPORT: "outbox" })).toThrow("MAIL_OUTBOX_FORBIDDEN_IN_QA");
    expect(() => load({ APP_ENV: "production", MAIL_TRANSPORT: "outbox" })).toThrow(ConfigError);
    expect(load({ APP_ENV: "development", MAIL_TRANSPORT: "outbox" }).mail.transport).toBe("outbox");
  });
  it("requires a valid SMTP URL, and encrypted transport in production", () => {
    expect(() => load({ APP_ENV: "qa", MAIL_TRANSPORT: "smtp" })).toThrow("SMTP_URL_REQUIRED");
    expect(() => load({ APP_ENV: "qa", MAIL_TRANSPORT: "smtp", SMTP_URL: "http://mail" })).toThrow("INVALID_SMTP_URL");
    expect(load({ APP_ENV: "qa", MAIL_TRANSPORT: "smtp", SMTP_URL: "smtp://mailpit.railway.internal:1025" }).mail.smtpUrl).toContain("mailpit");
    expect(() => load({ APP_ENV: "production", MAIL_TRANSPORT: "smtp", SMTP_URL: "smtp://relay:587" })).toThrow("SMTP_TLS_REQUIRED_IN_PRODUCTION");
    expect(load({ APP_ENV: "production", MAIL_TRANSPORT: "smtp", SMTP_URL: "smtp://relay:587", SMTP_REQUIRE_TLS: "true" }).mail.requireTls).toBe(true);
    expect(load({ APP_ENV: "production", MAIL_TRANSPORT: "smtp", SMTP_URL: "smtps://relay:465" }).mail.transport).toBe("smtp");
  });
  it("validates the push provider", () => {
    expect(() => load({ PUSH_PROVIDER: "fcm" })).toThrow("INVALID_PUSH_PROVIDER");
    expect(load({ PUSH_PROVIDER: "expo", EXPO_ACCESS_TOKEN: "t" }).push).toEqual({ provider: "expo", expoAccessToken: "t" });
  });
});
