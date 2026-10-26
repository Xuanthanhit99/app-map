import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OidcProviderConfig, VerifiedIdentity } from "../apps/api/src/lib/oidc";
import { hasTestDatabase, registerUser, startHarness, type Harness } from "./helpers/api-harness";

/** Stub verifier: the token string encodes the claims we want the "provider" to assert. */
const verifyIdToken = async (token: string, config: OidcProviderConfig): Promise<VerifiedIdentity> => {
  const claims = JSON.parse(Buffer.from(token, "base64url").toString()) as Omit<VerifiedIdentity, "provider"> & { aud: string };
  if (!config.audiences.includes(claims.aud)) throw new Error("aud");
  return { provider: config.provider, subject: claims.subject, email: claims.email, emailVerified: claims.emailVerified, name: claims.name ?? null, nonce: claims.nonce ?? null };
};
const tok = (c: Record<string, unknown>) => Buffer.from(JSON.stringify({ aud: "google-client", name: null, ...c })).toString("base64url");

describe.skipIf(!hasTestDatabase)("Federated sign-in (Google/Apple) with nonce binding (PostGIS)", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ env: { GOOGLE_CLIENT_IDS: "google-client", APPLE_CLIENT_IDS: "com.xuanthanhit99.reality" }, overrides: { verifyIdToken } });
  });
  afterAll(async () => { await h?.close(); });

  it("is unavailable while the feature flag is off, and capabilities say so", async () => {
    const r = await h.request("POST", "/v1/auth/federated", { body: { provider: "google", idToken: tok({ subject: "g1", email: "a@example.test", emailVerified: true }), client: "web" } });
    expect(r.status).toBe(503);
    expect((await h.request("GET", "/v1/auth/capabilities")).body.federated).toEqual({ google: false, apple: false });
  });

  it("creates a verified account from a provider-verified email; native clients must bind a nonce", async () => {
    await h.db.query("UPDATE feature_flags SET enabled = true WHERE key IN ('google_sign_in','apple_sign_in')");
    expect((await h.request("GET", "/v1/auth/capabilities")).body.federated).toEqual({ google: true, apple: true });
    const noNonce = await h.request("POST", "/v1/auth/federated", { body: { provider: "google", idToken: tok({ subject: "g2", email: "native@example.test", emailVerified: true, nonce: "n".repeat(20) }), client: "android" } });
    expect(noNonce.body.error).toBe("NONCE_REQUIRED");
    const wrong = await h.request("POST", "/v1/auth/federated", { body: { provider: "google", idToken: tok({ subject: "g2", email: "native@example.test", emailVerified: true, nonce: "n".repeat(20) }), nonce: "m".repeat(20), client: "android" } });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe("ID_TOKEN_NONCE_MISMATCH");
    const ok = await h.request("POST", "/v1/auth/federated", { body: { provider: "google", idToken: tok({ subject: "g2", email: "native@example.test", emailVerified: true, nonce: "n".repeat(20) }), nonce: "n".repeat(20), client: "android" } });
    expect(ok.status).toBe(200);
    expect(ok.body.user.emailVerified).toBe(true);
    expect(ok.body.tokens.accessToken).toMatch(/^rat_/);
  });

  it("accepts Apple's hashed nonce", async () => {
    const raw = "apple-raw-nonce-123456";
    const hashed = createHash("sha256").update(raw).digest("hex");
    const r = await h.request("POST", "/v1/auth/federated", { body: { provider: "apple", idToken: tok({ aud: "com.xuanthanhit99.reality", subject: "a1", email: "apple@example.test", emailVerified: true, nonce: hashed }), nonce: raw, client: "ios" } });
    expect(r.status).toBe(200);
  });

  it("never links to an existing account without a provider-verified email", async () => {
    await registerUser(h, { email: "owner@example.test" });
    const r = await h.request("POST", "/v1/auth/federated", { body: { provider: "google", idToken: tok({ subject: "attacker", email: "owner@example.test", emailVerified: false }), client: "web" } });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("VERIFIED_EMAIL_REQUIRED");
    const aud = await h.request("POST", "/v1/auth/federated", { body: { provider: "google", idToken: tok({ aud: "someone-else", subject: "x", email: "x@example.test", emailVerified: true }), client: "web" } });
    expect(aud.status).toBe(401);
  });
});
