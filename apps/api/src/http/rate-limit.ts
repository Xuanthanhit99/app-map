import type { Db } from "../db/pool";

export type RateDecision = { allowed: boolean; remaining: number; resetAt: number };
export interface RateLimitStore {
  hit(key: string, limit: number, windowMs: number, now?: number): Promise<RateDecision>;
}

/** Per-process store. With N replicas the effective limit is up to N x limit (documented). */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; reset: number }>();
  constructor(private readonly maxKeys = 50_000) {}
  async hit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateDecision> {
    if (this.windows.size > this.maxKeys) {
      for (const [id, entry] of this.windows) if (entry.reset <= now) this.windows.delete(id);
      if (this.windows.size > this.maxKeys) this.windows.clear();
    }
    let entry = this.windows.get(key);
    if (!entry || entry.reset <= now) { entry = { count: 0, reset: now + windowMs }; this.windows.set(key, entry); }
    entry.count++;
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.reset };
  }
}

/** Shared store for multi-replica deployments: one atomic upsert per hit. */
export class PostgresRateLimitStore implements RateLimitStore {
  constructor(private readonly db: Db) {}
  async hit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateDecision> {
    const { rows } = await this.db.query<{ count: number; reset_at: Date }>(
      `INSERT INTO rate_limit_buckets (key, count, reset_at) VALUES ($1, 1, to_timestamp($2 / 1000.0))
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limit_buckets.reset_at <= to_timestamp($3 / 1000.0) THEN 1 ELSE rate_limit_buckets.count + 1 END,
         reset_at = CASE WHEN rate_limit_buckets.reset_at <= to_timestamp($3 / 1000.0) THEN to_timestamp($2 / 1000.0) ELSE rate_limit_buckets.reset_at END
       RETURNING count, reset_at`,
      [key, now + windowMs, now],
    );
    const row = rows[0]!;
    return { allowed: row.count <= limit, remaining: Math.max(0, limit - row.count), resetAt: row.reset_at.getTime() };
  }
  async sweep(now = Date.now()): Promise<number> {
    const r = await this.db.query("DELETE FROM rate_limit_buckets WHERE reset_at < to_timestamp($1 / 1000.0)", [now]);
    return r.rowCount ?? 0;
  }
}
