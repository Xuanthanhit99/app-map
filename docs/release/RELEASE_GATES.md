# Release Gates — G0 to G11

Gate definitions come from the V2 brief §14. A gate is marked PASS only when its full definition was met with recorded evidence. Local runs that support a gate but do not meet its environment requirement are recorded as supporting evidence, not as PASS.

**Common run context**
- Commit: `bdb769b` on `feat/reality-v2-completion`. Base: `fix/p0-audit-checkpoint-1@2fbac77`.
- Date: 2026-10-22.
- Environment "local": Linux sandbox, Node 22, PostgreSQL 16.x + PostGIS 3.4 on 127.0.0.1. The API ran with `APP_ENV=development`, `DEV_FAKE_ROUTING=true` and `ROUTE_RATE_LIMIT_SCALE=20`. The web ran from a `next start` production build.
- Network: the sandbox cannot reach Overpass, Open-Meteo, OSM tiles or TomTom. In screenshots the basemap shows its documented "basemap unavailable" state.

## Summary

| Gate | Status | One-line reason |
|---|---|---|
| G0 Repository & contract recovery | **PASS** | HEAD, branches, PRs and decisions recovered; missing masters identified |
| G1 Backend | **PASS (local)** | 48 files / 324 tests incl. PostGIS integration; CI run pending on the PR |
| G2 Data readiness | **BLOCKED** | Live ingestion not verifiable from the sandbox; no QA environment; no licensed live traffic / flood / parking feeds |
| G3 Web functional | **BLOCKED** | 20/20 browser E2E PASS locally, but the gate requires real QA APIs |
| G4 Native Android | **BLOCKED** | Only the JS bundle export was verified; no SDK, EAS, emulator or device |
| G5 Native iOS | **BLOCKED** | Only the JS bundle export was verified; no Xcode, EAS or device |
| G6 Reality & trust | **BLOCKED** | All trust invariants PASS, but the State Matrix V2 document to verify against is missing |
| G7 Visual fidelity | **BLOCKED** | Approved masters missing. Screenshots exist for 1536 / 390 / landscape; tablet and Dynamic Type NOT RUN |
| G8 SEO | **NOT RUN** (partial) | Sitemap, robots, canonical and JSON-LD checked; crawl and performance budgets not run; indexing intentionally off outside production |
| G9 Security & privacy | **PASS (local)** | Authorization, consent, export / delete, abuse controls, headers; 0 critical in production dependency audit |
| G10 End-to-end product | **BLOCKED** | Full loop PASSES locally only with dev fixtures and straight-line routing; real routing needs a TomTom key |
| G11 Release candidate | **FAIL** | Mandatory gates G2–G7 and G10 are unverified. Rollback and monitoring are not set up for a deployed environment |

## Details

### G0 — Repository and contract recovery — PASS
- Recovered state:
  - `main@c5915eb` is a stub.
  - `feat/production-foundation@dbe7c8f` has Draft PR #1.
  - `fix/p0-audit-checkpoint-1@2fbac77` is the newest superset; this work branches from it.
  - CI PRs #2–#4 are closed.
- Decisions: `docs/audit/CHECKPOINT-01.md`, `docs/audit/CHECKPOINT-02.md`, and the approved GPS policy (skew 2000 ms / age 30 s / mocked never READY).
- Missing: State Matrix V2, Flow 06 contract, Responsive Production Master / G01 Visual Master V1, Product V2 master, Stories contract.
- Evidence: `docs/product/REALITY_FULL_PRODUCT_MASTER.md` §provenance.

### G1 — Backend — PASS (local)
- Command: `npm run typecheck` (exit 0), then `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npx vitest run`.
- Result: 48 files, 324 tests, 0 failures, 33.7 s.
- Covers:
  - Authentication: rotation and reuse revocation.
  - RBAC.
  - zod validation and the error contract.
  - Forward-only checksummed migrations.
  - Rate limits.
  - Ingestion resilience: retry, breaker, idempotency.
  - Retention.
  - OpenAPI contract (85 operations, `docs/api/openapi.json`).
- Remaining:
  - The CI run of `.github/workflows/ci.yml` with the PostGIS service has not executed yet; it runs on the Draft PR.
  - No load test.

### G2 — Data readiness — BLOCKED
- Verified: adapter parsing, provenance, licence fields and freshness windows against recorded payloads (`tests/api-ingestion.int.test.ts`); fixture-leak guard (`tests/no-fake-data-leak.test.ts`).
- Not verified: live Overpass / Open-Meteo fetches, real coverage in Hanoi or HCMC, ingestion quality over time.
- Unblock:
  1. Provision an isolated QA environment (proposed Railway `reality-qa` with PostGIS).
  2. Run `scripts/worker.ts`.
  3. Record coverage from the `/quan-tri/san-sang` readiness page.
- Licensing: Open-Meteo commercial use is RESTRICTED; an owner decision is needed before commercial launch.
- Missing feeds: live traffic, flood, parking occupancy, transit, events. The product shows UNKNOWN for these.

### G3 — Web functional — BLOCKED (local E2E PASS)
- Command: `bash e2e/reset-db.sh && cd e2e && DATABASE_URL=postgres://postgres@127.0.0.1:5432/reality_e2e node run.mjs`.
- Result: 20 passed, 0 failed, 0 console errors, 0 axe violations. Viewports: desktop 1536×960, mobile 390×844, landscape 844×390.
- Evidence: `docs/release/evidence/local/` (20 PNGs and `e2e-results.json`).
- Blocker: the gate requires real QA APIs, and none are provisioned.
- Defects fixed during this pass:
  - MapLibre v6 worker blocked by bundling: now served same-origin.
  - Journey destination was served from a stale 60 s cache: now uncached.
  - E2E runs were not isolated: fixed with `reset-db.sh`.

### G4 — Native Android — BLOCKED
- Command: `npm run export:android --workspace @app-map/mobile`. Result: PASS, Hermes bundle 2.95 MB.
- Not run: installable APK / AAB, GPS on device, lifecycle, map, navigation.
- Needs: Android SDK or EAS credentials and a device or emulator. Store publishing requires owner approval.

### G5 — Native iOS — BLOCKED
- Command: `npm run export:ios --workspace @app-map/mobile`. Result: PASS, Hermes bundle 2.95 MB.
- Not run: installable build, permissions, device tests.
- Needs: Xcode / EAS, an Apple developer account and a device.

### G6 — Reality and trust — BLOCKED (invariants PASS)
- PASS: `tests/state-engine.test.ts` and `tests/api-reality-trust.int.test.ts` cover:
  - UNKNOWN without evidence.
  - A single report is never KNOWN.
  - Distinct-contributor corroboration.
  - CONFLICT independent of freshness.
  - Safety only from KNOWN.
  - Moderation holds.
  - Severity thresholds.
- E2E G10 shows one report as "chưa xác minh" and the second contributor's report as KNOWN with source and freshness.
- Blocker: State Matrix V2 is missing, so cell-by-cell verification is impossible.

### G7 — Visual fidelity — BLOCKED
- Approved masters are missing. The UI is a PROPOSED RECONSTRUCTION; no master was replaced.
- Captured: desktop 1536, mobile 390 and landscape screenshots, plus automated axe checks.
- Not run: tablet, Dynamic Type 200 %, manual screen reader pass.
- Open decision: the mobile palette diverges from the web tokens.

### G8 — SEO — NOT RUN (partial checks pass)
- PASS (E2E SEO step and place step):
  - `robots.txt` disallows when `SITE_INDEXING` is not `true`.
  - Sitemap and manifest are served.
  - Canonical and JSON-LD are present on place pages.
- NOT RUN: crawl of all public pages, Core Web Vitals / Lighthouse budgets. These need a deployed QA URL.

### G9 — Security and privacy — PASS (local)
- PASS:
  - Server-side RBAC (E2E Admin step plus int tests).
  - Consent-gated contribution.
  - Export (E2E G9) and account deletion (int tests).
  - Rate limits and trusted-proxy identity.
  - Single-use refresh rotation (E2E G9).
  - httpOnly cookies; tokens are never exposed to client JS.
  - CSP and security headers (E2E).
  - Production config refusals.
- `npm audit --omit=dev`:
  - 0 critical. MapLibre was upgraded to 6.13.0 for GHSA-jrc7-96c5-q579.
  - 23 high and 11 moderate remain, all in Expo / Metro / Jest build tooling and not shipped to browsers.
- Remaining: Expo SDK upgrade for the tooling advisories, external penetration test, secrets management on a deployed environment.

### G10 — End-to-end product — BLOCKED (local loop PASS)
- PASS locally:
  1. Open.
  2. Search / discover.
  3. Inspect place.
  4. Understand state (UNKNOWN → corroborated KNOWN).
  5. Decide.
  6. Plan journey.
  7. Start.
  8. Arrive.
  9. Save / watch / report / verify, with the watcher notified.
  10. Landscape journey.
- These used dev fixtures and `DEV_FAKE_ROUTING`.
- Blockers:
  - Real routing (TomTom key).
  - Real data in QA.
  - "Start navigation" means route plus impact only; turn-by-turn guidance is not implemented.
  - "Handle changes" is verified only for impact refresh, not for re-routing against a live provider.

### G11 — Release candidate — FAIL
- Mandatory gates are unverified.
- Not done: rollback and monitoring for a deployed environment, QA deploy, production approval.
- **Recommendation: NOT READY.**
