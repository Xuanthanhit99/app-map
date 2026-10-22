import { mkdirSync, writeFileSync } from "node:fs";
import { buildApp } from "../src/app";
import { createClientIdentityResolver } from "../src/client-identity";
import { loadConfig } from "../src/config";
import { createPool } from "../src/db/pool";
import { MemoryRateLimitStore } from "../src/http/rate-limit";
import { registerAll } from "../src/modules/registry";
import { buildOpenApi } from "../src/openapi";
import { UnconfiguredEvidenceRepository } from "../src/verified-evidence-repository";

// Builds the router without connecting (pool is lazy) and writes docs/api/openapi.json.
const config = loadConfig({ DATABASE_URL: "postgres://unused@localhost/unused", APP_ENV: "development" } as unknown as NodeJS.ProcessEnv);
const db = createPool(config.databaseUrl, 1);
const { router } = buildApp({ db, config, rateLimits: new MemoryRateLimitStore(), now: () => new Date(), routing: null, verifyIdToken: async () => { throw new Error("n/a"); } },
  createClientIdentityResolver({ mode: "none" }), registerAll(), new UnconfiguredEvidenceRepository());

const out = new URL("../../../docs/api/openapi.json", import.meta.url);
mkdirSync(new URL(".", out), { recursive: true });
writeFileSync(out, JSON.stringify(buildOpenApi(router), null, 2) + "\n");
void db.end();
console.log(`wrote ${out.pathname} (${router.list().length} operations)`);
