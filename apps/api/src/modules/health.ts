import type { Router } from "../http/router";
import type { AppDeps } from "./deps";

export function registerHealthRoutes(router: Router, deps: AppDeps) {
  router.get("/health/live", () => ({ body: { status: "ok" } }));
  router.get("/health/ready", async () => {
    let database = false, migrations = 0, postgis = false;
    try {
      const r = await deps.db.query<{ n: number; postgis: string | null }>(
        "SELECT (SELECT count(*)::int FROM schema_migrations) AS n, (SELECT extversion FROM pg_extension WHERE extname = 'postgis') AS postgis");
      database = true; migrations = r.rows[0]?.n ?? 0; postgis = Boolean(r.rows[0]?.postgis);
    } catch { database = false; }
    const ready = database && postgis && migrations > 0;
    // Optional providers are reported, not required: their absence degrades features honestly.
    return {
      status: ready ? 200 : 503,
      body: { status: ready ? "ready" : "not_ready", database, postgis, migrations,
        routingConfigured: Boolean(deps.routing), geocodingConfigured: Boolean(deps.config.tomtomSearchKey),
        ingestionEnabled: deps.config.ingestion.enabled, env: deps.config.env },
    };
  });
}
