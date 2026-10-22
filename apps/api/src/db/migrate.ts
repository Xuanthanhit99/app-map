import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./pool";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations", import.meta.url));
const LOCK_KEY = 72_270_001; // advisory lock: only one migrator at a time across replicas

export type MigrationResult = { applied: string[]; skipped: string[] };

/**
 * Forward-only, checksummed migrations. Each file runs in its own transaction.
 * A changed checksum on an applied file aborts: applied migrations are immutable.
 */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<MigrationResult> {
  const client = await db.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const files = (await readdir(dir)).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
    const { rows } = await client.query<{ name: string; checksum: string }>("SELECT name, checksum FROM schema_migrations");
    const done = new Map(rows.map((r) => [r.name, r.checksum]));
    const result: MigrationResult = { applied: [], skipped: [] };
    for (const file of files) {
      const sql = await readFile(join(dir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = done.get(file);
      if (previous) {
        if (previous !== checksum) throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${file}`);
        result.skipped.push(file);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
        await client.query("COMMIT");
        result.applied.push(file);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`MIGRATION_FAILED:${file}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return result;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
