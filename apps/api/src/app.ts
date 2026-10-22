import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequestListener, Router } from "./http/router";
import { MemoryRateLimitStore, PostgresRateLimitStore, type RateLimitStore } from "./http/rate-limit";
import type { ClientIdentityResolver } from "./client-identity";
import type { AppDeps } from "./modules/deps";
import { createIdentityService, registerIdentityRoutes } from "./modules/identity";
import { registerAccountRoutes } from "./modules/account";
import { registerPlaceRoutes } from "./modules/places";
import { registerContributionRoutes } from "./modules/contribution";
import { registerGeocodeRoutes } from "./modules/geocode";
import { registerRoutingRoutes } from "./modules/routing";
import { registerHealthRoutes } from "./modules/health";
import { handleVerifiedDecisionRead } from "./verified-decision-http";
import { buildOpenApi } from "./openapi";
import { evidenceRepositoryFromEnv, type VerifiedEvidenceRepository } from "./verified-evidence-repository";

export type BuiltApp = {
  router: Router;
  listener: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  deps: AppDeps;
};

export function rateLimitStoreFor(deps: Pick<AppDeps, "config" | "db">): RateLimitStore {
  return deps.config.rateLimitStore === "postgres" ? new PostgresRateLimitStore(deps.db) : new MemoryRateLimitStore();
}

export type Registrar = (router: Router, deps: AppDeps) => void;

export function buildApp(deps: AppDeps, identifyClient: ClientIdentityResolver, extra: Registrar[] = [],
  legacyEvidence: VerifiedEvidenceRepository = evidenceRepositoryFromEnv()): BuiltApp {
  const router = new Router();
  const identity = createIdentityService(deps);
  registerHealthRoutes(router, deps);
  registerIdentityRoutes(router, identity);
  registerAccountRoutes(router, deps);
  registerGeocodeRoutes(router, deps);
  registerPlaceRoutes(router, deps);
  registerContributionRoutes(router, deps);
  registerRoutingRoutes(router, deps);
  for (const register of extra) register(router, deps);
  router.get("/v1/openapi.json", () => ({ body: buildOpenApi(router) }), { cacheSeconds: 300 });
  const listener = createRequestListener(router, {
    authenticate: identity.authenticate,
    rateLimits: deps.rateLimits,
    identifyClient,
    allowedOrigins: deps.config.allowedOrigins,
    limitScale: deps.config.routeRateLimitScale,
    verboseErrors: deps.config.env === "development" || deps.config.env === "test",
    ...(deps.config.env === "test" ? { log: (e: Record<string, unknown>) => { if (e.event === "unhandled_error") process.stderr.write(JSON.stringify(e) + "\n"); } } : {}),
  }, async (req, res) => {
    // P0 legacy decision endpoints (EVIDENCE_FEED) remain available for existing clients.
    return handleVerifiedDecisionRead(req, res, legacyEvidence);
  });
  return { router, listener, deps };
}
