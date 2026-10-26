import type { Db } from "../db/pool";
import type { AppConfig } from "../config";
import { PostgresRateLimitStore } from "../http/rate-limit";
import { expireReports } from "../modules/contribution";
import { propagate } from "../modules/reality/repository";
import { OverpassAdapter } from "./adapters/osm-overpass";
import { OpenMeteoAdapter } from "./adapters/open-meteo";
import { runIngestion, tileBBox, type RunOutcome } from "./framework";
import { upsertRegions, type CoverageRegion } from "./regions";
import { applyRetention } from "./retention";
import { createPushSender } from "../lib/push";
import { dispatchPendingPushes } from "../modules/push-dispatch";

export type SchedulerDeps = { db: Db; config: AppConfig; regions: CoverageRegion[]; now: () => Date; transport?: typeof fetch; log?: (e: Record<string, unknown>) => void };

export function createJobs(deps: SchedulerDeps) {
  const log = deps.log ?? ((e) => process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), ...e }) + "\n"));
  const overpass = new OverpassAdapter(deps.config.ingestion.overpassUrl, deps.config.ingestion.userAgent, deps.transport);
  const meteo = new OpenMeteoAdapter(deps.config.ingestion.openMeteoUrl, deps.config.ingestion.userAgent, deps.transport);

  async function places(regionId?: string): Promise<RunOutcome[]> {
    const out: RunOutcome[] = [];
    for (const region of deps.regions.filter((r) => !regionId || r.id === regionId)) {
      for (const tile of tileBBox(region.bbox, 0.05)) {
        const r = await runIngestion(deps.db, overpass, { regionId: region.id, bbox: tile }, deps.now());
        log({ event: "ingestion", source: "osm-overpass", region: region.id, status: r.status, ...("errorCode" in r ? { errorCode: r.errorCode } : {}), ...("upserted" in r ? { upserted: r.upserted } : {}) });
        out.push(r);
        if (r.status === "SKIPPED" && r.reason === "CIRCUIT_OPEN") break;
      }
    }
    return out;
  }

  async function weather(regionId?: string): Promise<RunOutcome[]> {
    const out: RunOutcome[] = [];
    for (const region of deps.regions.filter((r) => !regionId || r.id === regionId)) {
      const r = await runIngestion(deps.db, meteo, { regionId: region.id, bbox: region.bbox }, deps.now());
      log({ event: "ingestion", source: "open-meteo", region: region.id, status: r.status, ...("errorCode" in r ? { errorCode: r.errorCode } : {}), ...("upserted" in r ? { upserted: r.upserted } : {}) });
      if (r.status === "SUCCEEDED") await propagate(deps.db, r.subjectKeys, deps.now());
      out.push(r);
    }
    return out;
  }

  /** Expire reports and re-evaluate subjects whose evidence may have lapsed (meaningful changes fan out). */
  async function maintenance() {
    const now = deps.now();
    const expired = await expireReports(deps.db, now);
    const { rows } = await deps.db.query<{ subject_key: string }>(
      `SELECT DISTINCT ON (subject_key) subject_key, truth FROM reality_state_snapshots
        WHERE evaluated_at > $1::timestamptz - interval '24 hours' ORDER BY subject_key, evaluated_at DESC, id DESC`, [now]);
    const keys = rows.map((r) => r.subject_key);
    const changes = await propagate(deps.db, keys, now);
    await new PostgresRateLimitStore(deps.db).sweep(now.getTime());
    const retention = await applyRetention(deps.db, now);
    return { expired, reevaluated: keys.length, changes: changes.length, retention };
  }

  return { places, weather, maintenance, ensureRegions: () => upsertRegions(deps.db, deps.regions) };
}

/** Long-running worker loop. Each job has its own interval and never overlaps itself. */
export function startScheduler(deps: SchedulerDeps): { stop(): void } {
  const jobs = createJobs(deps);
  const timers: ReturnType<typeof setInterval>[] = [];
  const running = new Set<string>();
  const every = (name: string, ms: number, fn: () => Promise<unknown>) => {
    const tick = async () => {
      if (running.has(name)) return;
      running.add(name);
      try { await fn(); } catch (e) { (deps.log ?? console.error)({ event: "job_failed", job: name, error: e instanceof Error ? e.name : "UNKNOWN" }); }
      finally { running.delete(name); }
    };
    void tick();
    timers.push(setInterval(() => void tick(), ms));
  };
  void jobs.ensureRegions();
  every("maintenance", 60_000, () => jobs.maintenance());
  const push = createPushSender(deps.config, deps.transport);
  if (push.available) every("push", 30_000, async () => { const r = await dispatchPendingPushes(deps.db, push, deps.now()); if (r.notifications) (deps.log ?? ((e) => process.stdout.write(JSON.stringify(e) + "\n")))({ event: "push_dispatch", ...r }); });
  if (deps.config.ingestion.enabled) {
    every("weather", 15 * 60_000, () => jobs.weather());
    every("places", 6 * 3_600_000, () => jobs.places()); // idempotency window keeps it daily per tile
  }
  return { stop() { timers.forEach(clearInterval); } };
}
