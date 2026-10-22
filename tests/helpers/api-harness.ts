import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { buildApp, type Registrar } from "../../apps/api/src/app";
import { createClientIdentityResolver } from "../../apps/api/src/client-identity";
import { loadConfig } from "../../apps/api/src/config";
import { createPool, type Db } from "../../apps/api/src/db/pool";
import { migrate } from "../../apps/api/src/db/migrate";
import { MemoryRateLimitStore } from "../../apps/api/src/http/rate-limit";
import type { AppDeps } from "../../apps/api/src/modules/deps";
import { registerAll } from "../../apps/api/src/modules/registry";
import { UnconfiguredEvidenceRepository } from "../../apps/api/src/verified-evidence-repository";

/** Admin connection (superuser) used to clone a migrated template per test file. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
export const hasTestDatabase = Boolean(TEST_DATABASE_URL);

let templateReady: Promise<string> | null = null;
async function template(): Promise<string> {
  templateReady ??= (async () => {
    const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await admin.connect();
    const name = `reality_tpl_${process.pid}`;
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.end();
    const db = createPool(withDatabase(TEST_DATABASE_URL, name), 1);
    await migrate(db);
    await db.end();
    return name;
  })();
  return templateReady;
}

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

export type Harness = {
  baseUrl: string;
  db: Db;
  deps: AppDeps;
  clock: { now: Date; advance(ms: number): void; set(d: Date): void };
  request<T = any>(method: string, path: string, opts?: { token?: string; body?: unknown; headers?: Record<string, string> }): Promise<{ status: number; body: T; headers: Headers }>;
  close(): Promise<void>;
};

export async function startHarness(options: { extra?: Registrar[]; overrides?: Partial<AppDeps>; env?: Record<string, string> } = {}): Promise<Harness> {
  const tpl = await template();
  const name = `reality_t_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name} TEMPLATE ${tpl}`);
  await admin.end();
  const url = withDatabase(TEST_DATABASE_URL, name);
  const db = createPool(url, 5);
  const clock = { now: new Date("2026-10-22T03:00:00Z"), advance(ms: number) { this.now = new Date(this.now.getTime() + ms); }, set(d: Date) { this.now = d; } };
  const config = loadConfig({ DATABASE_URL: url, APP_ENV: "test", RATE_LIMIT_STORE: "memory", ROUTE_RATE_LIMIT_SCALE: "100", ...options.env } as unknown as NodeJS.ProcessEnv);
  const deps: AppDeps = {
    db, config, rateLimits: new MemoryRateLimitStore(), now: () => clock.now, routing: null,
    verifyIdToken: async () => { throw new Error("not configured"); },
    ...options.overrides,
  };
  const { listener } = buildApp(deps, createClientIdentityResolver({ mode: "none" }), options.extra ?? registerAll(), new UnconfiguredEvidenceRepository());
  const server: Server = createServer((req, res) => { void listener(req, res); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    baseUrl, db, deps, clock,
    async request(method, path, opts = {}) {
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      if (opts.token) headers.authorization = `Bearer ${opts.token}`;
      if (opts.body !== undefined) headers["content-type"] ??= "application/json";
      const r = await fetch(baseUrl + path, { method, headers, ...(opts.body !== undefined ? { body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body) } : {}) });
      const text = await r.text();
      let body: any = text;
      try { body = text ? JSON.parse(text) : null; } catch { /* raw */ }
      return { status: r.status, body, headers: r.headers };
    },
    async close() {
      await new Promise<void>((r) => server.close(() => r()));
      await db.end();
      const a = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    },
  };
}

let counter = 0;
export async function registerUser(h: Harness, overrides: Partial<{ email: string; password: string; displayName: string }> = {}) {
  const email = overrides.email ?? `user${++counter}_${Math.random().toString(36).slice(2, 6)}@example.test`;
  const r = await h.request("POST", "/v1/auth/register", { body: { email, password: overrides.password ?? "correct horse battery", displayName: overrides.displayName ?? "Người thử", client: "web" } });
  if (r.status !== 201) throw new Error(`register failed ${r.status} ${JSON.stringify(r.body)}`);
  return { email, token: r.body.tokens.accessToken as string, refresh: r.body.tokens.refreshToken as string, id: r.body.user.id as string };
}

export async function makeRole(h: Harness, userId: string, role: "moderator" | "admin") {
  await h.db.query("UPDATE users SET role = $2 WHERE id = $1", [userId, role]);
}

/** Inserts a place row for tests only (tests may use fixtures; production code paths never do). */
export async function insertTestPlace(h: Harness, p: { name: string; category: string; lat: number; lng: number; slug?: string; openingHours?: string }) {
  const { rows } = await h.db.query(
    `INSERT INTO places (slug, name, category, geom, source_id, source_ref, opening_hours)
     VALUES ($1,$2,$3, ST_SetSRID(ST_MakePoint($4,$5),4326)::geography, 'osm-overpass', $6, $7) RETURNING id, slug`,
    [p.slug ?? `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 6)}`, p.name, p.category, p.lng, p.lat, `test/${Math.random()}`, p.openingHours ?? null]);
  return rows[0] as { id: string; slug: string };
}
