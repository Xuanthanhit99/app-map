# Product Completion Matrix

Verified at commit `bdb769b` (branch `feat/reality-v2-completion`), 2026-10-22, in the local sandbox. Status values:
- **DONE**: implemented and verified by a recorded test.
- **DONE-LOCAL**: verified only with local doubles or fixtures.
- **PARTIAL**
- **BLOCKED**: an external input is missing.
- **NOT STARTED**

Visual conformance is **BLOCKED** for every row: the approved masters are missing, and all UI is a PROPOSED RECONSTRUCTION.

| Area | Feature | API | Web | Mobile | Evidence | Status / blocker |
|---|---|---|---|---|---|---|
| Identity | Register, login, logout, refresh rotation, reuse revocation | ✅ | ✅ | ✅ | `tests/api-identity-account.int.test.ts`; E2E G9 renewal | DONE |
| Identity | Email verification, password reset | — | — | — | — | BLOCKED: email provider |
| Identity | Google / Apple sign-in | ✅ verifier, flag off | — | — | unit tests | BLOCKED: client IDs |
| Privacy | Consent, contribution opt-in, data export, account deletion | ✅ | ✅ | ✅ (opt-in, logout) | int tests; E2E G9 export | DONE |
| Reality | State engine (truth / freshness / nature / safety, 9 domains) | ✅ | ✅ | ✅ | `tests/state-engine.test.ts`, `api-reality-trust.int.test.ts` | DONE |
| Reality | Place / area / category pages, map explorer, pulse | ✅ | ✅ | ✅ (home, place) | E2E desktop / mobile steps 1–3 | DONE |
| Data | OSM places + published hours ingestion | ✅ | n/a | n/a | `api-ingestion.int.test.ts` (recorded payloads) | DONE-LOCAL. Live fetch BLOCKED: sandbox network, QA env |
| Data | Open-Meteo forecast ingestion | ✅ | n/a | n/a | same | DONE-LOCAL. Licence: commercial use RESTRICTED |
| Data | Live traffic, flood, parking occupancy, transit, events | — | — | — | — | BLOCKED: no licensed feed; shown as UNKNOWN |
| Data | Circuit breaker, retry, idempotent runs, retention | ✅ | admin view | — | `api-ingestion`, `api-retention` int tests | DONE |
| Contribution | Reports, dedupe, corroboration, votes, holds | ✅ | ✅ | ✅ | int tests; E2E G10 two-contributor flow | DONE |
| Contribution | Report photos | — | — | — | — | BLOCKED: object storage |
| Moderation | Queue, conflicts, user actions, audit log, RBAC | ✅ | ✅ | — | E2E Admin step; int tests | DONE (web only by design) |
| Decide | Intent → ranked options with reasons and unknowns | ✅ | ✅ | ✅ | `api-intelligence.int.test.ts`; E2E decide | DONE-LOCAL. Flow 06 contract MISSING |
| Journey | Plan, route, start, impact, arrive, share | ✅ | ✅ | ✅ | int tests; E2E G10 journey + landscape | DONE-LOCAL (dev straight-line routing). Real routing BLOCKED: TomTom key |
| Journey | Turn-by-turn guidance | — | — | — | — | NOT STARTED |
| Watch | Saved places, watch areas, severity thresholds, cooldown, in-app notifications | ✅ | ✅ | ✅ | int tests; E2E watcher notified | DONE |
| Watch | Push notifications | tokens table | — | — | — | BLOCKED: FCM / APNs |
| Stories | Create, moderate, publish, public pages | ✅ | ✅ | — | int tests | PARTIAL: Stories contract MISSING; not on mobile |
| AI | Assistant | flag only | — | — | — | NOT STARTED: no LLM provider |
| SEO | Sitemap, robots gate, JSON-LD, canonical, manifest | ✅ | ✅ | n/a | E2E SEO step | DONE |
| A11y | axe on key pages (desktop, mobile) | n/a | ✅ | — | E2E: 0 violations | DONE (web, automated only). Manual screen-reader pass NOT RUN |
| Security | CSP and headers, rate limits, trusted proxy, prod config refusals, fixture leak guard | ✅ | ✅ | n/a | E2E headers; `no-fake-data-leak.test.ts`; config tests | DONE |
| Security | Dependency audit | — | 0 critical | 23 high (Expo / Metro tooling) | `npm audit --omit=dev` | PARTIAL |
| Mobile | Production JS bundles (Android, iOS) | n/a | n/a | ✅ | `expo export` 2.95 MB each | DONE |
| Mobile | Native build, signing, device / emulator tests, store submission | n/a | n/a | — | — | BLOCKED: EAS / SDK / Xcode / devices, owner approval |
| Visual | Conformance to approved masters | n/a | — | — | — | BLOCKED: masters missing |
| Ops | QA environment (Railway), production deploy | — | — | — | — | BLOCKED: QA not provisioned; production needs owner approval |
