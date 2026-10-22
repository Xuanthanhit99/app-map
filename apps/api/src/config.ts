export type AppConfig = {
  port: number;
  databaseUrl: string;
  allowedOrigins: string[];
  publicWebUrl: string;
  env: "development" | "test" | "qa" | "production";
  accessTokenTtlMs: number;
  refreshTokenTtlMs: number;
  rateLimitStore: "memory" | "postgres";
  /** Multiplies per-route and global request limits (abuse limits on accounts are fixed). Tests use > 1. */
  routeRateLimitScale: number;
  oidc: { googleClientIds: string[]; appleClientIds: string[] };
  tomtomRoutingKey?: string;
  tomtomSearchKey?: string;
  anthropicApiKey?: string;
  ingestion: { enabled: boolean; overpassUrl: string; openMeteoUrl: string; userAgent: string };
  /** Seed fixture data for local development. Refused in qa/production (no fake production data). */
  allowDevFixtures: boolean;
  /** Straight-line routing double for local E2E only. Refused outside development/test. */
  devFakeRouting: boolean;
  /**
   * Outbound email. `none` = not configured (verification/reset report EMAIL_DELIVERY_UNAVAILABLE);
   * `smtp` = real delivery (QA uses an isolated Mailpit catcher); `outbox` = in-memory capture,
   * development/test only.
   */
  mail: { transport: "none" | "smtp" | "outbox"; smtpUrl?: string; requireTls: boolean; from: string };
  /** Push delivery. `expo` sends through the Expo push service (FCM/APNs credentials live in EAS). */
  push: { provider: "none" | "expo"; expoAccessToken?: string };
};

export class ConfigError extends Error { constructor(m: string) { super(m); this.name = "ConfigError"; } }

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appEnv = (env.APP_ENV ?? "development") as AppConfig["env"];
  if (!["development", "test", "qa", "production"].includes(appEnv)) throw new ConfigError("INVALID_APP_ENV");
  const databaseUrl = env.DATABASE_URL ?? "";
  if (!databaseUrl) throw new ConfigError("DATABASE_URL_REQUIRED");
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new ConfigError("INVALID_PORT");
  const allowDevFixtures = env.ALLOW_DEV_FIXTURES === "true";
  if (allowDevFixtures && (appEnv === "qa" || appEnv === "production")) throw new ConfigError("DEV_FIXTURES_FORBIDDEN_IN_" + appEnv.toUpperCase());
  const devFakeRouting = env.DEV_FAKE_ROUTING === "true";
  if (devFakeRouting && (appEnv === "qa" || appEnv === "production")) throw new ConfigError("DEV_FAKE_ROUTING_FORBIDDEN_IN_" + appEnv.toUpperCase());
  const store = (env.RATE_LIMIT_STORE ?? (appEnv === "production" || appEnv === "qa" ? "postgres" : "memory")) as AppConfig["rateLimitStore"];
  if (store !== "memory" && store !== "postgres") throw new ConfigError("INVALID_RATE_LIMIT_STORE");
  const mailTransport = (env.MAIL_TRANSPORT ?? "none") as AppConfig["mail"]["transport"];
  if (!["none", "smtp", "outbox"].includes(mailTransport)) throw new ConfigError("INVALID_MAIL_TRANSPORT");
  if (mailTransport === "outbox" && (appEnv === "qa" || appEnv === "production")) throw new ConfigError("MAIL_OUTBOX_FORBIDDEN_IN_" + appEnv.toUpperCase());
  if (mailTransport === "smtp") {
    let u: URL;
    try { u = new URL(env.SMTP_URL ?? ""); } catch { throw new ConfigError("SMTP_URL_REQUIRED"); }
    if (u.protocol !== "smtp:" && u.protocol !== "smtps:") throw new ConfigError("INVALID_SMTP_URL");
    // Production mail must be encrypted in transit: implicit TLS (smtps://) or enforced STARTTLS.
    if (appEnv === "production" && u.protocol !== "smtps:" && env.SMTP_REQUIRE_TLS !== "true") throw new ConfigError("SMTP_TLS_REQUIRED_IN_PRODUCTION");
  }
  const pushProvider = (env.PUSH_PROVIDER ?? "none") as AppConfig["push"]["provider"];
  if (pushProvider !== "none" && pushProvider !== "expo") throw new ConfigError("INVALID_PUSH_PROVIDER");
  return {
    port,
    databaseUrl,
    env: appEnv,
    allowedOrigins: list(env.CORS_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8081,http://127.0.0.1:8081,http://localhost:4173,http://127.0.0.1:4173"),
    publicWebUrl: (env.PUBLIC_WEB_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    accessTokenTtlMs: 15 * 60_000,
    refreshTokenTtlMs: 30 * 24 * 3_600_000,
    rateLimitStore: store,
    routeRateLimitScale: (() => { const v = Number(env.ROUTE_RATE_LIMIT_SCALE ?? 1); if (!(v >= 1 && v <= 1000)) throw new ConfigError("INVALID_ROUTE_RATE_LIMIT_SCALE"); if (v !== 1 && (appEnv === "production")) throw new ConfigError("RATE_LIMIT_SCALE_FORBIDDEN_IN_PRODUCTION"); return v; })(),
    oidc: { googleClientIds: list(env.GOOGLE_CLIENT_IDS), appleClientIds: list(env.APPLE_CLIENT_IDS) },
    ...(env.TOMTOM_API_KEY ? { tomtomRoutingKey: env.TOMTOM_API_KEY } : {}),
    ...(env.TOMTOM_SEARCH_API_KEY ? { tomtomSearchKey: env.TOMTOM_SEARCH_API_KEY } : {}),
    ...(env.ANTHROPIC_API_KEY ? { anthropicApiKey: env.ANTHROPIC_API_KEY } : {}),
    ingestion: {
      enabled: env.INGESTION_ENABLED === "true",
      overpassUrl: env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
      openMeteoUrl: env.OPEN_METEO_URL ?? "https://api.open-meteo.com/v1/forecast",
      userAgent: env.INGESTION_USER_AGENT ?? "REALITY/0.2 (+https://github.com/Xuanthanhit99/app-map)",
    },
    allowDevFixtures,
    devFakeRouting,
    mail: { transport: mailTransport, ...(mailTransport === "smtp" ? { smtpUrl: env.SMTP_URL! } : {}), requireTls: env.SMTP_REQUIRE_TLS === "true", from: env.MAIL_FROM ?? "REALITY <no-reply@reality.local>" },
    push: { provider: pushProvider, ...(env.EXPO_ACCESS_TOKEN ? { expoAccessToken: env.EXPO_ACCESS_TOKEN } : {}) },
  };
}
