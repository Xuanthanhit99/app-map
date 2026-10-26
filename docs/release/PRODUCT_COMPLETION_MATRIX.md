# Product Completion Matrix

Verified on 2026-10-26 (Asia/Bangkok) on `feat/reality-v2-completion`, Draft PR #5. Implementation `b136268`. Local suite after that commit: 56 files / 381 tests. Last recorded CI is run `40285556100` on `5b1bb15` (379 tests). The previous matrix baseline was commit `4678f78`.

Status values:
- **DONE**: implemented and verified by a recorded test.
- **DONE-LOCAL**: verified only with local doubles or fixtures.
- **PARTIAL**: partly done; the row says what is missing.
- **BLOCKED**: an external input is missing.
- **NOT STARTED**

Visual conformance is BLOCKED for every row: the approved masters are missing. The UI is the owner-directed navy + amber **proposed reconstruction**.

| Area | Feature | API | Web | Mobile | Evidence | Status / blocker |
|---|---|---|---|---|---|---|
| Identity | Register, login, logout, refresh rotation, reuse revocation | ✅ | ✅ | ✅ | `api-identity-account.int`, E2E G9 renewal | DONE |
| Identity | Email verification (24 h single-use link) | ✅ | ✅ page, banner, resend | ✅ resend, deep-link screen | `api-account-recovery.int`; local `APP_ENV=qa` SMTP catcher: SENT then VERIFIED (`qa05/qa-flow.json`) | DONE-LOCAL. Mailpit-on-Railway not deployed. This machine has no Mailpit binary; the API sent through a local SMTP catcher |
| Identity | Password reset / account recovery (30 min, revokes sessions, change notice) | ✅ | ✅ | ✅ request + deep-link reset screen | int tests; local QA catcher delivered the reset link, old password then 401 | DONE-LOCAL. Same SMTP note as above |
| Identity | Change password (notifies owner) | ✅ | ✅ (new) | ✅ (new) | int test | DONE |
| Identity | Google / Apple sign-in (native, nonce-bound) | ✅ verifier + nonce | — | ✅ shown only when configured | `api-federated.int` | BLOCKED: client IDs, Apple team, native build |
| Privacy | Consent, export, account deletion | ✅ | ✅ deletion dialog says a Google/Apple account with no password may leave the password blank | ✅ native JSON export via share sheet | int + E2E G9 export; local `APP_ENV=qa` export 200 and delete 204 | DONE (mobile export not device-tested; web copy change not re-screenshotted) |
| Privacy | Location consent / revocation | n/a | browser-managed | ✅ OS permission status, "no background location", link to OS settings | code; `app.json` disables background location | DONE (device test pending) |
| Reality | State engine, place / area / map / pulse | ✅ | ✅ | ✅ | unit + int + E2E | DONE |
| Data | OSM places + Open-Meteo ingestion, breaker, retention | ✅ | admin views | n/a | int tests; local worker on `reality_qa`: Overpass 262 records and Open-Meteo 1 cell at 14:51 Asia/Bangkok (ODbL). Earlier cafe sample: HTTP 502 then 67 | DONE-LOCAL. Deployed QA: BLOCKED (Railway project not created) |
| Data | Live traffic, flood, parking occupancy, transit, events | — | — | — | — | BLOCKED: no licensed feed; shown as UNKNOWN |
| Contribution | Reports, corroboration, votes, holds, moderation | ✅ | ✅ | ✅ | int + E2E G10 | DONE |
| Contribution | Report photos | — | — | — | — | BLOCKED: object storage |
| Decide | Ranked options with reasons and unknowns | ✅ | ✅ | ✅ | int + E2E | DONE-LOCAL. Flow 06 contract MISSING |
| Journey | Plan, route, start, impact, arrive, share, reroute | ✅ | ✅ | ✅ | int + E2E | DONE-LOCAL. Real routing needs the TomTom key |
| Journey | Turn-by-turn guidance (provider instructions, vi-VN, off-route suspension) | ✅ stored per route revision | ✅ next step | ✅ next step + reroute | `route-guidance.test` | PARTIAL: not exercised with real TomTom; voice guidance not implemented |
| Journey | Stale-impact disclosure | n/a | ✅ | ✅ | code review | DONE |
| Watch | Saved places, watch areas, thresholds, in-app notifications | ✅ | ✅ | ✅ | int + E2E | DONE |
| Watch | Push delivery (Expo; consent, quiet hours, priority, token hygiene) | ✅ worker dispatcher | n/a | ✅ registration + tap routing | `api-account-recovery.int` push case | BLOCKED: EAS projectId + FCM/APNs credentials, device |
| Links | Deep links (`reality://`), universal / App Links | n/a | ✅ `/.well-known/*` from env (404 until configured) | ✅ routes + `app.config.ts` | export + config check | BLOCKED: signing fingerprints / Apple team ID |
| Stories | Create, moderate, publish | ✅ | ✅ | — | int tests | PARTIAL: contract missing; not on mobile |
| AI | Assistant | flag only | — | — | — | NOT STARTED: no LLM provider |
| SEO | Sitemap, robots, canonical, JSON-LD, indexing boundary | ✅ | ✅ | n/a | `seo-crawl.json` refreshed 14:54 Asia/Bangkok, 17 pages, 0 issues, robots disallow-all | DONE-LOCAL. Deployed crawl NOT RUN |
| Performance | Lab budgets | n/a | remeasured | — | `qa05/lighthouse.json` (14:58 Asia/Bangkok) | PARTIAL: text pages mobile perf 0.91–0.93, LCP still over 2.5 s; `/ban-do` mobile perf 0.65, TBT 1.79 s, still over budget. Not field CWV |
| A11y | axe on key pages; Lighthouse a11y | n/a | ✅ 1.0 | contrast via shared tokens | E2E axe, `theme-parity.test` | DONE (automated). Manual screen reader NOT RUN |
| Security | Enforced dependency gate, headers, rate limits, internal-hop identity | ✅ | ✅ | CI run `40285133976`: image-size and node-forge absent from both bundles; decode-uri-component in the bundle as classified | `audit-gate.json`, `security-gate.test`, nodemailer 10.2.1 | DONE |
| Ops | QA environment | config ✅ | config ✅ | — | `QA_DEPLOYMENT.md`, `CHECKPOINT-05.md` | BLOCKED: no Railway token. GraphQL HTTP 400 again at 14:50 Asia/Bangkok. Local `APP_ENV=qa` boot is not a deployment |
| Ops | Installable Android test build | n/a | n/a | workflow ✅ | `native-qa-build.yml` | BLOCKED: needs QA URL; not run |
| Ops | iOS test build, store submission | n/a | n/a | — | — | BLOCKED: Apple credentials; submission requires owner approval |
