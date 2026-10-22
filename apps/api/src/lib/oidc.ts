import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

export type OidcProviderConfig = {
  provider: "google" | "apple";
  issuers: string[];
  jwksUrl: string;
  audiences: string[];
};
export const GOOGLE: Omit<OidcProviderConfig, "audiences"> = {
  provider: "google", issuers: ["https://accounts.google.com", "accounts.google.com"], jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
};
export const APPLE: Omit<OidcProviderConfig, "audiences"> = {
  provider: "apple", issuers: ["https://appleid.apple.com"], jwksUrl: "https://appleid.apple.com/auth/keys",
};

export type VerifiedIdentity = { provider: "google" | "apple"; subject: string; email: string | null; emailVerified: boolean; name: string | null };
export class OidcError extends Error { constructor(code: string) { super(code); this.name = "OidcError"; } }

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
type JwksFetcher = (url: string) => Promise<{ keys: Jwk[] }>;

const defaultFetcher: JwksFetcher = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(url, { signal: controller.signal, redirect: "error" });
    if (!r.ok) throw new OidcError("JWKS_UNAVAILABLE");
    return await r.json() as { keys: Jwk[] };
  } finally { clearTimeout(timer); }
};

function decodePart(part: string): Record<string, unknown> {
  try { return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>; }
  catch { throw new OidcError("MALFORMED_TOKEN"); }
}

/** RS256 ID-token verification against the provider JWKS (cached 1 h). No third-party JWT library. */
export function createOidcVerifier(fetcher: JwksFetcher = defaultFetcher, now: () => number = Date.now) {
  const cache = new Map<string, { at: number; keys: Jwk[] }>();
  async function keys(url: string, force = false): Promise<Jwk[]> {
    const hit = cache.get(url);
    if (!force && hit && now() - hit.at < 3_600_000) return hit.keys;
    const body = await fetcher(url);
    if (!Array.isArray(body?.keys)) throw new OidcError("JWKS_INVALID");
    cache.set(url, { at: now(), keys: body.keys });
    return body.keys;
  }
  return async function verifyIdToken(token: string, config: OidcProviderConfig): Promise<VerifiedIdentity> {
    if (!config.audiences.length) throw new OidcError("PROVIDER_NOT_CONFIGURED");
    const parts = token.split(".");
    if (parts.length !== 3 || token.length > 8192) throw new OidcError("MALFORMED_TOKEN");
    const header = decodePart(parts[0]!);
    const payload = decodePart(parts[1]!);
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw new OidcError("UNSUPPORTED_ALG");
    let jwk = (await keys(config.jwksUrl)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await keys(config.jwksUrl, true)).find((k) => k.kid === header.kid);
    if (!jwk) throw new OidcError("UNKNOWN_KEY");
    const ok = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(parts[2]!, "base64url"));
    if (!ok) throw new OidcError("BAD_SIGNATURE");
    const t = Math.floor(now() / 1000);
    if (typeof payload.iss !== "string" || !config.issuers.includes(payload.iss)) throw new OidcError("BAD_ISSUER");
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.some((a) => typeof a === "string" && config.audiences.includes(a))) throw new OidcError("BAD_AUDIENCE");
    if (typeof payload.exp !== "number" || payload.exp < t - 60) throw new OidcError("EXPIRED");
    if (typeof payload.iat === "number" && payload.iat > t + 300) throw new OidcError("ISSUED_IN_FUTURE");
    if (typeof payload.sub !== "string" || !payload.sub) throw new OidcError("NO_SUBJECT");
    const emailVerified = payload.email_verified === true || payload.email_verified === "true";
    return {
      provider: config.provider,
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      emailVerified,
      name: typeof payload.name === "string" ? payload.name : null,
    };
  };
}
