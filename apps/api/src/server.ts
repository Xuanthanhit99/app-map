import { createServer } from "node:http";
import { buildApp, rateLimitStoreFor } from "./app";
import { clientIdentityResolverFromEnv } from "./client-identity";
import { loadConfig } from "./config";
import { createPool } from "./db/pool";
import { migrate } from "./db/migrate";
import { createOidcVerifier } from "./lib/oidc";
import { TomTomRoutingProvider } from "./tomtom-routing-provider";
import { registerAll } from "./modules/registry";
import { devStraightLineRouting } from "./dev-routing";

// Fails closed on invalid configuration (TRUST_PROXY, APP_ENV, DATABASE_URL, fixtures in QA/production…).
const config = loadConfig();
const identifyClient = clientIdentityResolverFromEnv();
const db = createPool(config.databaseUrl, Number(process.env.DB_POOL_MAX ?? 10));
const routing = config.tomtomRoutingKey ? new TomTomRoutingProvider(config.tomtomRoutingKey) : config.devFakeRouting ? devStraightLineRouting : null;
const base = { db, config, now: () => new Date(), routing, verifyIdToken: createOidcVerifier() };
const deps = { ...base, rateLimits: rateLimitStoreFor(base) };

async function main() {
  if (process.env.MIGRATE_ON_START === "true") {
    const r = await migrate(db);
    process.stdout.write(JSON.stringify({ event: "migrations", applied: r.applied }) + "\n");
  }
  const { listener } = buildApp(deps, identifyClient, registerAll());
  const server = createServer((req, res) => { void listener(req, res); });
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.listen(config.port, () => process.stdout.write(JSON.stringify({ event: "listening", port: config.port, env: config.env }) + "\n"));
  const shutdown = () => { server.close(() => { void db.end().then(() => process.exit(0)); }); setTimeout(() => process.exit(1), 10_000).unref(); };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
main().catch((e) => { process.stderr.write(JSON.stringify({ event: "startup_failed", error: e instanceof Error ? e.message : String(e) }) + "\n"); process.exit(1); });
