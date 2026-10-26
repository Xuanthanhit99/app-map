# REALITY — System Architecture

Branch `feat/reality-v2-completion`. Everything below is **VERIFIED IN GIT** unless labelled otherwise.

```
            ┌────────────┐     ┌──────────────────────┐
 Browser ──▶│ apps/web   │────▶│ apps/api (Node http) │──▶ PostgreSQL 16 + PostGIS 3.4
            │ Next.js BFF│     │  /v1/*  OpenAPI 3.1  │      (migrations 001–004)
            └────────────┘     └──────────┬───────────┘
 Expo app ─────────────────────────────────┘           ▲
 (apps/mobile, bearer tokens in secure storage)        │
                                   scripts/worker.ts ──┘  ingestion scheduler + retention
                                     ├─ osm-overpass adapter  (places, published hours)
                                     └─ open-meteo adapter    (weather forecast)
 Shared core: src/ (@core/*) — state engine, domain catalog, decision, GPS policy, i18n errors
```

## Monorepo

| Path | Role |
|---|---|
| `src/` | Shared pure TypeScript: `reality/{catalog,state-engine,categories,decision}.ts`, `location/*` (GPS quality and lifecycle), `i18n/error-messages.ts`, `theme/tokens.ts` |
| `apps/api` | HTTP API, no framework: `http/` (router, zod validation, errors, rate limit), `modules/` (identity, account, places, contribution, reality, decision, journeys, watch-pulse, stories, seo, admin, data-readiness, geocode, routing, health), `ingestion/`, `db/` |
| `apps/web` | Next.js 16 (App Router, Turbopack) as a backend-for-frontend |
| `apps/mobile` | Expo SDK 54, expo-router, MapLibre React Native |
| `tests/` | vitest unit, contract and PostGIS integration (`*.int.test.ts`) |
| `e2e/` | Separate package: playwright-core + @sparticuz/chromium + axe-core |

## Data model (migrations)

- `001_foundation.sql`: users, federated identities, sessions, consents, preferences, data sources, ingestion runs, source health, areas, places (geography), road segments, observations, reality state snapshots, reports, evidence, votes, moderation actions, stories, saved places, watch areas, notifications, push tokens, journeys, journey events, shares, audit events, feature flags, incidents, rate-limit buckets. `reality_fold()` is an immutable `unaccent` wrapper used for Vietnamese search with `pg_trgm`.
- `002_source_catalog.sql`: source registry with licence and reliability; feature flags.
- `003_trust_holds.sql`: held-for-review reports, confirm / deny counts.
- `004_coverage_regions.sql`: coverage regions with bbox.

Migrations are forward-only, checksummed, and applied under an advisory lock.

## Identity and sessions

- Opaque access token (15 min) and refresh token (30 days), stored as SHA-256 hashes. Refresh is single-use; reuse revokes the whole family.
- Passwords: scrypt N = 32768. OIDC RS256 verifier for Google / Apple (flag-gated, client IDs **MISSING**).
- Web: tokens live only in httpOnly cookies `rt_a` (SameSite=Lax) and `rt_r` (SameSite=Strict, path `/`); `src/proxy.ts` renews silently. `/api/proxy/[...path]` forwards to the API and blocks credential endpoints. Client JavaScript never sees tokens.
- Mobile: tokens in `expo-secure-store`; the API client rotates on 401.
- RBAC: user / moderator / admin, enforced server-side for every `/v1/admin/*` route. Admin actions write `audit_events`.

## Reality pipeline

1. Evidence arrives from ingestion (observations) or users (reports).
2. Reports are checked for consent, rate limit, deduplication, and place / domain validity; corroboration clusters are computed by place or by radius (`clusterRadiusM`).
3. `evaluateState(domain, evidence, now)` is pure and deterministic. It returns truth, value, safety, freshness, nature, supporting evidence and signals.
4. Snapshots are persisted, and watchers are notified through severity thresholds with a 30-minute cooldown and dedupe keys.
5. Journeys re-check impact along the route corridor.

## Ingestion

- The framework handles retry with jitter, a circuit breaker persisted per source (5 failures, 10 min open), and idempotent runs per window. A retention job prunes expired data.
- **UNVERIFIED live**: the build sandbox cannot reach Overpass or Open-Meteo. Adapters are verified against recorded payloads only.

## Security controls

- CSP: `default-src 'self'`, workers `'self' blob:`, `frame-ancestors 'none'`. Other headers: X-Content-Type-Options `nosniff`, Referrer-Policy `strict-origin-when-cross-origin`, Permissions-Policy (geolocation self only), X-Frame-Options `DENY`.
- Rate limits are per route, with a Postgres store in qa / production. Trusted-proxy client identity is CIDR-gated. `ROUTE_RATE_LIMIT_SCALE` must be 1 in production (config refuses otherwise).
- Config refuses dev fixtures and fake routing in qa / production.
- The MapLibre worker is served same-origin from `/vendor` (copied at build) so the CSP needs no third-party script origins.
- Dependency audit (production tree, 2026-10-22): **0 critical**. MapLibre was upgraded to 6.13.0 to fix GHSA-jrc7-96c5-q579. 23 high and 11 moderate findings remain, all inside Expo / Metro / Jest build tooling. Fixing them needs an Expo SDK major upgrade; none ship in the web bundle.

## Environments

| Env | Database | Notes |
|---|---|---|
| development (local) | local PostGIS | Dev fixtures and straight-line routing allowed |
| test | template DB cloned per test file | Fake clock |
| e2e (local) | `reality_e2e`, recreated by `e2e/reset-db.sh` | The script refuses non-local or non-`_e2e` databases |
| qa | **not provisioned**. A Railway `reality-qa` project is proposed, matching the owner's other `*-qa` projects | Needed to verify live ingestion (G2) |
| production | **not provisioned; no deploy without owner approval** | |

## CI

`.github/workflows/ci.yml` runs one job on a PostGIS service: typecheck, unit + integration tests, production dependency audit (warning only), web build, and Android / iOS bundle exports. Superseded runs are cancelled, which keeps cost within the $10/month Actions budget. Browser E2E runs locally or against QA at release gates.
