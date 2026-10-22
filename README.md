# app-map

Foundation implementation for the Real-world State Network product.

## Locked architecture implemented first

- Composable State Model
  - TruthStatus: KNOWN / UNKNOWN / CONFLICT
  - Freshness: FRESH / AGING / STALE
  - System Availability: ONLINE / OFFLINE / DEGRADED / ERROR
  - Permission: GRANTED / LIMITED / DENIED / NOT_REQUIRED
  - Content Availability: CONTENT / EMPTY / NOT_APPLICABLE
  - Interaction Lifecycle: ACTION_REQUIRED / PENDING / ACTIONED / EXPIRED / DISMISSED
  - Loading/fetch lifecycle is separate
- Presentation Resolver with safety-first precedence and modifier behavior
- Domain resolvers for Road and Parking as first vertical slices
- Responsive layout contract
- Accessibility semantics contract
- Design tokens from the locked Calm Cartographic visual direction

## Product invariants represented in code

- Unknown != Safe
- Conflict != Danger
- Freshness modifies certainty
- Offline does not replace valid cached domain state
- Permission denial only limits capabilities that actually depend on permission
- Active experiences should degrade gracefully instead of collapsing into generic errors
- Structured state is separated from presentation

## Workspace

| Path | What |
|---|---|
| `src/` | Shared core: state engine, domain catalog, decision, GPS policy, tokens |
| `apps/api` | HTTP API on PostgreSQL + PostGIS (`docs/api/openapi.json`) |
| `apps/web` | Next.js web app and admin console |
| `apps/mobile` | Expo app (Android / iOS) |
| `tests/` | vitest unit, contract and PostGIS integration tests |
| `e2e/` | Browser E2E with screenshots and axe |

## Run locally

```bash
npm ci
# PostgreSQL 16 + PostGIS 3.4 required
DATABASE_URL=postgres://postgres@127.0.0.1:5432/reality npm run db:migrate
# optional local-only fixtures (refused outside APP_ENV=development)
APP_ENV=development ALLOW_DEV_FIXTURES=true DATABASE_URL=... npx tsx apps/api/scripts/seed-dev-fixtures.ts
DATABASE_URL=... npm run api:dev            # API on :3001
API_INTERNAL_URL=http://127.0.0.1:3001 npm run web:dev
npm run mobile:start                        # EXPO_PUBLIC_API_BASE_URL in apps/mobile/.env
```

Tests: `npm run typecheck && TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm test`.
E2E: `bash e2e/reset-db.sh && cd e2e && DATABASE_URL=.../reality_e2e node run.mjs`.

## Status

- Product: `docs/product/REALITY_FULL_PRODUCT_MASTER.md`
- Architecture: `docs/architecture/REALITY_SYSTEM_ARCHITECTURE.md`
- Completion: `docs/release/PRODUCT_COMPLETION_MATRIX.md`
- Gates G0–G11: `docs/release/RELEASE_GATES.md`. The current recommendation is **NOT READY**.
