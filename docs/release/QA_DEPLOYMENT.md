# QA Deployment — `reality-qa` (Railway)

Owner approval: 2026-10-22. Approved option: "Approve, sleep when idle". Estimated cost is about $5–10/month. Production is not touched.

## Status

| Item | State |
|---|---|
| Config-as-code, Dockerfiles, migrations pre-deploy, health checks | DONE in git (`deploy/railway/*.json`, `apps/api/Dockerfile`, `apps/web/Dockerfile`) |
| Image layout smoke test (local, no Docker daemon registry access) | PASS. The API ran in `APP_ENV=qa` from the image's file layout: migrations applied, `/health/ready` returned 200 ready. Next standalone served `/`, `/robots.txt` and the MapLibre worker |
| Railway project creation | **BLOCKED (credentials)**. 2026-10-22 attempts returned `Deploys have been paused due to an upstream issue`. On 2026-10-26 14:12 Asia/Bangkok the GraphQL endpoint `backboard.railway.com/graphql/v2` answered HTTP 400 (the API is up). This environment has no `RAILWAY_TOKEN`, and GitHub Actions secrets are not readable (HTTP 403). Nothing was created and nothing was billed |
| Live integration tests on QA | NOT RUN. They depend on the item above |

Deploy branch: `qa/reality-v2`. It mirrors the PR head; pushes to it do not trigger GitHub Actions.

## Topology

| Service | Source | Start | Health | Sleep | Notes |
|---|---|---|---|---|---|
| `postgis` | image `postgis/postgis:16-3.4` | — | — | no | Volume at `/var/lib/postgresql/data`, `PGDATA=/var/lib/postgresql/data/pgdata`; private network only |
| `api` | repo, `deploy/railway/api.json` | `node --import tsx src/server.ts` | `/health/ready` | yes | Pre-deploy step: `node --import tsx scripts/migrate.ts` (forward-only, advisory lock) |
| `worker` | repo, `deploy/railway/worker.json` | `node --import tsx scripts/worker.ts` | process | **no** | Ingestion (OSM, Open-Meteo), maintenance, push dispatch |
| `web` | repo, `deploy/railway/web.json` | `node apps/web/server.js` | `/robots.txt` | yes | Next standalone |
| `mailpit` | image `axllent/mailpit:v1.27` | — | — | yes | Catches every QA email. The UI is reachable only through the Railway dashboard / private network; it has no public domain |

## Variables (names only; values are set in Railway, never in git)

- **Shared**: `APP_ENV=qa`, `INTERNAL_PROXY_SECRET` (≥32 random chars; the same value on `api` and `web`).
- **api / worker**:
  - `DATABASE_URL=${{postgis.…}}` over the private network.
  - `TRUST_PROXY=railway`.
  - `CORS_ORIGINS=<web domain>`, `PUBLIC_WEB_URL=<web domain>`.
  - `MAIL_TRANSPORT=smtp`, `SMTP_URL=smtp://mailpit.railway.internal:1025`, `MAIL_FROM`.
  - `INGESTION_ENABLED=true` (worker), `COVERAGE_REGIONS` (default central Hà Nội).
  - `TOMTOM_API_KEY`: **set by the owner**, never by Claude.
  - Optional: `PUSH_PROVIDER=expo`, `EXPO_ACCESS_TOKEN`, `GOOGLE_CLIENT_IDS`, `APPLE_CLIENT_IDS`.
- **web**:
  - `API_INTERNAL_URL=http://api.railway.internal:<port>`.
  - `NEXT_PUBLIC_SITE_URL=<web domain>` (build arg).
  - `COOKIE_SECURE=true`.
  - `SITE_INDEXING` unset, so QA is never indexed.
- **Refused by config in QA** (the service fails to boot if set): `ALLOW_DEV_FIXTURES`, `DEV_FAKE_ROUTING`, `MAIL_TRANSPORT=outbox`.

## Restricted administrative access

- Only an account promoted by SQL on the QA database becomes `admin` (`UPDATE users SET role='admin' WHERE email=…`). The UI has no self-service elevation. All admin actions are recorded in `audit_events`.
- Mailpit and Postgres have no public domains.

## Monitoring

- Railway deploy and HTTP logs.
- Structured JSON request logs (`event: http_request`, no bodies or coordinates).
- `/health/ready` reports database, PostGIS, migrations and provider configuration.
- The `/quan-tri/san-sang` readiness page and `/quan-tri/nguon` source health page show ingestion runs, circuit-breaker state and coverage.

## Test plan once the project exists

Run each step from the Railway shell or a one-off job, because the build sandbox cannot reach `*.up.railway.app`:
1. `/health/ready`: migrations 6, PostGIS true.
2. Browser E2E:
   - Command: `WEB_URL=<qa web> MAILPIT_URL=http://mailpit.railway.internal:8025 EVIDENCE_DIR=qa node e2e/run.mjs`.
   - Fixtures are refused in QA, so the place/decide steps must target real ingested places.
   - The runner's fixture-specific steps are adapted for that run.
3. SEO and performance:
   - `WEB_URL=<qa web> EVIDENCE_DIR=qa node e2e/seo-crawl.mjs`
   - `WEB_URL=<qa web> EVIDENCE_DIR=qa node e2e/perf.mjs`
4. Ingestion: worker logs `event: ingestion` with `SUCCEEDED`; `/v1/sources` shows freshness; the readiness page shows coverage.
5. Real routing: after the owner sets `TOMTOM_API_KEY`, create a journey. Expect `routing: OK`, provider `tomtom`, and Vietnamese guidance steps present.
6. Android: run the manual `Native QA build` workflow with the QA URLs, then install the APK on a device.
