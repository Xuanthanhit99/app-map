import type pg from "pg";
import { withTransaction, type Db } from "../db/pool";
import { circuitAllows, CIRCUIT, PermanentError, TransientError, withRetry, type CircuitState } from "../lib/resilience";
import type { BBox } from "../lib/geo";

export type IngestionScope = { regionId: string; bbox: BBox; categories?: string[] };

export type FetchResult<T> = { records: T[]; rejected: number };

/** A provider adapter: fetch (may throw Transient/Permanent errors), then persist normalized records. */
export interface SourceAdapter<T> {
  readonly sourceId: string;
  /** Idempotency window: the same scope will not be re-ingested inside it. */
  readonly windowMs: number;
  fetch(scope: IngestionScope, now: Date): Promise<FetchResult<T>>;
  persist(client: pg.PoolClient, records: T[], runId: string, scope: IngestionScope, now: Date): Promise<{ upserted: number; rejected: number; subjectKeys: string[] }>;
}

export type RunOutcome =
  | { status: "SUCCEEDED"; runId: string; recordsIn: number; upserted: number; rejected: number; attempts: number; subjectKeys: string[] }
  | { status: "SKIPPED"; reason: "ALREADY_INGESTED" | "CIRCUIT_OPEN" | "SOURCE_DISABLED" }
  | { status: "FAILED"; runId: string; errorCode: string; attempts: number };

export function jobKey(sourceId: string, scope: IngestionScope, now: Date, windowMs: number): string {
  const window = Math.floor(now.getTime() / windowMs);
  const b = scope.bbox;
  return `${sourceId}|${scope.regionId}|${b.west},${b.south},${b.east},${b.north}|${(scope.categories ?? []).join("+")}|${window}`;
}

export async function runIngestion<T>(db: Db, adapter: SourceAdapter<T>, scope: IngestionScope, now: Date,
  retry = { attempts: 3, baseDelayMs: 2_000, maxDelayMs: 20_000 } as { attempts: number; baseDelayMs: number; maxDelayMs: number; sleep?: (ms: number) => Promise<void> }): Promise<RunOutcome> {
  const source = await db.query<{ enabled: boolean; circuit_state: CircuitState; opened_at: Date | null }>(
    `SELECT s.enabled, h.circuit_state, h.opened_at FROM data_sources s JOIN source_health h ON h.source_id = s.id WHERE s.id = $1`, [adapter.sourceId]);
  const row = source.rows[0];
  if (!row?.enabled) return { status: "SKIPPED", reason: "SOURCE_DISABLED" };
  const circuit = circuitAllows(row.circuit_state, row.opened_at, now);
  if (!circuit.allowed) return { status: "SKIPPED", reason: "CIRCUIT_OPEN" };

  // A worker that died mid-run must not block the window forever.
  await db.query(`UPDATE ingestion_runs SET status = 'FAILED', error_code = 'ABANDONED', finished_at = $2
                   WHERE source_id = $1 AND status = 'RUNNING' AND started_at < $2::timestamptz - interval '30 minutes'`, [adapter.sourceId, now]);
  const key = jobKey(adapter.sourceId, scope, now, adapter.windowMs);
  const started = await db.query<{ id: string }>(
    `INSERT INTO ingestion_runs (source_id, job_key, scope, status, started_at) VALUES ($1,$2,$3,'RUNNING',$4)
     ON CONFLICT (job_key) WHERE status IN ('RUNNING','SUCCEEDED') DO NOTHING RETURNING id`,
    [adapter.sourceId, key, JSON.stringify(scope), now]);
  const runId = started.rows[0]?.id;
  if (!runId) return { status: "SKIPPED", reason: "ALREADY_INGESTED" };

  let attempts = 0;
  try {
    const { value: fetched, attempts: used } = await withRetry(async (a) => { attempts = a; return adapter.fetch(scope, now); }, retry);
    attempts = used;
    const persisted = await withTransaction(db, (client) => adapter.persist(client, fetched.records, runId, scope, now));
    await db.query(
      `UPDATE ingestion_runs SET status = 'SUCCEEDED', finished_at = now(), records_in = $2, records_upserted = $3, records_rejected = $4, attempt = $5 WHERE id = $1`,
      [runId, fetched.records.length + fetched.rejected, persisted.upserted, fetched.rejected + persisted.rejected, attempts]);
    await db.query(
      `UPDATE source_health SET circuit_state = 'CLOSED', consecutive_failures = 0, opened_at = NULL, last_success_at = $2, updated_at = now() WHERE source_id = $1`,
      [adapter.sourceId, now]);
    return { status: "SUCCEEDED", runId, recordsIn: fetched.records.length + fetched.rejected, upserted: persisted.upserted, rejected: fetched.rejected + persisted.rejected, attempts, subjectKeys: persisted.subjectKeys };
  } catch (error) {
    const code = error instanceof TransientError || error instanceof PermanentError ? error.code : "ADAPTER_ERROR";
    await db.query(`UPDATE ingestion_runs SET status = 'FAILED', finished_at = now(), error_code = $2, attempt = $3 WHERE id = $1`, [runId, code, Math.max(1, attempts)]);
    await db.query(
      `UPDATE source_health SET consecutive_failures = consecutive_failures + 1, last_failure_at = $2, last_error_code = $3,
         circuit_state = CASE WHEN circuit_state = 'HALF_OPEN' OR consecutive_failures + 1 >= $4 THEN 'OPEN' ELSE circuit_state END,
         opened_at = CASE WHEN circuit_state = 'HALF_OPEN' OR consecutive_failures + 1 >= $4 THEN $2 ELSE opened_at END,
         updated_at = now() WHERE source_id = $1`,
      [adapter.sourceId, now, code, CIRCUIT.failureThreshold]);
    return { status: "FAILED", runId, errorCode: code, attempts: Math.max(1, attempts) };
  }
}

/** Split a bbox into tiles no larger than `size` degrees (gentle on public APIs). */
export function tileBBox(b: BBox, size: number): BBox[] {
  const tiles: BBox[] = [];
  for (let w = b.west; w < b.east - 1e-9; w += size) {
    for (let s = b.south; s < b.north - 1e-9; s += size) {
      tiles.push({ west: round(w), south: round(s), east: round(Math.min(b.east, w + size)), north: round(Math.min(b.north, s + size)) });
    }
  }
  return tiles;
}
const round = (n: number) => Math.round(n * 1e6) / 1e6;
