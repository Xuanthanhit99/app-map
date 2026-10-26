# Release Gates — G0 to G11

Gate definitions come from the V2 brief §14. A gate is marked PASS only when its full definition was met with recorded evidence. Local runs that support a gate without meeting its environment requirement are listed as supporting evidence, not as PASS.

**Run context (this revision)**
- Branch: `feat/reality-v2-completion`, Draft PR #5. Code commit: `2524b87`. CI head that this record covers: `c195a69` (run `40285133976`). Earlier CI record: `4678f78` / run `39745834087`.
- Date: 2026-10-26.
- Local environment: Linux sandbox, Node 22.23, PostgreSQL 16 + PostGIS 3.4.
  - Integration suite: `TEST_DATABASE_URL` set; tests fail (they do not skip) if that database is unreachable.
  - Separate local QA boot: `APP_ENV=qa`, fixtures and straight-line routing refused by config, `MAIL_TRANSPORT=none`, no TomTom key. Database `reality_qa` on localhost. This is not the Railway project.
- Overpass and Open-Meteo were reachable. TomTom, Gradle/Maven, the Expo API and a Railway account were not.
- QA (`reality-qa` on Railway): still **not created**. The GraphQL endpoint answered (HTTP 400 on an empty request). This environment has no Railway token, so nothing was created or billed. See `QA_DEPLOYMENT.md` and `docs/audit/CHECKPOINT-04.md`.

## Summary

| Gate | Status | Reason |
|---|---|---|
| G0 Repository & contract recovery | **PASS** | Unchanged; masters still missing |
| G1 Backend | **PASS (local + CI)** | 55 files / 379 tests incl. PostGIS. CI run `40285133976` succeeded on `c195a69` (14:19–14:21 Asia/Bangkok) |
| G2 Data readiness | **BLOCKED** | Railway `reality-qa` still not created. Supporting only: one live Overpass tile (67 cafes) and one Open-Meteo cell on a local `APP_ENV=qa` database. No licensed live traffic / flood / parking feeds |
| G3 Web functional | **BLOCKED** | 26/26 browser E2E PASS locally on the previous revision (desktop, tablet, mobile, landscape); the gate requires real QA APIs |
| G4 Native Android | **BLOCKED** | JS bundles only. An installable debug-signed APK workflow exists (manual), but it needs the QA URL; no device testing |
| G5 Native iOS | **BLOCKED** | Needs Apple signing / EAS credentials and a device |
| G6 Reality & trust | **BLOCKED** | Invariants PASS; State Matrix V2 still missing |
| G7 Visual fidelity | **BLOCKED** | Navy + amber reconstruction applied across web and mobile; screenshots at 1536 / 820 / 390 / landscape; **owner approval required**, masters missing |
| G8 SEO | **NOT RUN** (partial local PASS) | Previous local crawl 17 pages / 0 issues and the Lighthouse lab run still stand. This revision did not re-crawl. Deployed crawl and field CWV not run |
| G9 Security & privacy | **PASS (local + CI)** | Enforced gate: 0 critical. 3 documented exceptions. CI confirmed image-size and node-forge absent from both bundles; decode-uri-component is in the bundle, as classified. Nodemailer addressparser advisories fixed |
| G10 End-to-end product | **BLOCKED** | Full loop PASS locally with fixtures + straight-line routing; real routing / QA data needed |
| G11 Release candidate | **FAIL** | G2–G8 and G10 unverified; QA not deployed |

**Recommendation: NOT READY.**

## Details

### G1 — Backend — PASS (local + CI)
- Commands on 2026-10-26:
  - `npm run typecheck` (exit 0)
  - `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npx vitest run` → **55 files, 379 tests, 0 failures**
- Added: mail-recipient boundary (registration rejects the nodemailer addressparser proofs; installed parser does not emit an `@evil.com` recipient).
- Coverage added on 2026-10-22 and still in this suite:
  - account recovery: verification, reset, expiry, single use, email binding, enumeration resistance, session revocation, change notices;
  - federated sign-in with nonce binding;
  - push dispatch: consent, quiet hours, priority, dead-token disable, no coordinates in payload;
  - provider turn guidance parsing and the guidance engine;
  - mail / push config safeguards, internal-hop client identity, security gate behaviour, palette parity and contrast.
- When `TEST_DATABASE_URL` is set and the database is unreachable, the integration tests **fail**; they do not skip. Observed locally. The CI job sets it.
- CI record:
  - Run `39724229411` succeeded on `c3e14b4`.
  - Run `39745834087` succeeded on `4678f78`.
  - Run `40285133976` succeeded on `c195a69` (started 14:19, finished 14:21 Asia/Bangkok). The verify job passed typecheck, **55 files / 379 tests** with PostGIS, the web build, Android and iOS exports with source maps, and the blocking security gate. Gate log: `security gate: PASS`; bundle maps 2; image-size and node-forge `absent`; decode-uri-component `IN BUNDLE` (the documented runtime-unreachable exception). https://github.com/Xuanthanhit99/app-map/actions/runs/40285133976

### G2 — Data readiness — BLOCKED
- Railway project still not created (no token in this environment). The platform pause string from 2026-10-22 was not reproduced; the GraphQL endpoint answered HTTP 400.
- Supporting local evidence, not a gate pass: database `reality_qa`, six migrations, then a live ingest of bbox `105.84,21.02,105.85,21.03`. Overpass returned 67 cafes on the retry (first attempt `HTTP_502`). Open-Meteo stored one forecast cell. Public place responses carry `license: ODbL-1.0` and `© OpenStreetMap contributors`.
- No licensed live traffic, flood, or parking feed.
- To unblock the gate, follow `QA_DEPLOYMENT.md` with the owner's Railway token and TomTom key.

### G3 — Web functional — BLOCKED (local E2E 26/26)
- Command: `bash e2e/reset-db.sh && cd e2e && SMTP_SINK_PORT=2525 DATABASE_URL=…/reality_e2e node run.mjs`.
- Result: **26 passed, 0 failed, 0 console errors, 0 serious axe findings**. Viewports: desktop 1536, tablet 820, mobile 390, landscape 844×390.
- Evidence: `docs/release/evidence/local/` (screenshots + `e2e-results.json`).
- New steps cover email verification and the full forgot → reset flow: old password rejected, sessions revoked, change notice delivered.

### G4 — Native Android — BLOCKED
- Done:
  - `expo export` Android with source maps: PASS.
  - Dynamic `app.config.ts` resolves App Links, the push `projectId` and the Apple entitlement from environment.
- Installable build: the manual `Native QA build` workflow (debug-signed APK) is ready. It has **not been run**: it needs the QA API URL and would spend Actions minutes. A local build is impossible (Gradle/Maven unreachable).
- Not run: GPS, permissions, lifecycle, guidance, push, offline on device.

### G5 — Native iOS — BLOCKED
- Done: `expo export` iOS: PASS.
- Needed: Apple Developer team, EAS credentials and a device. Sign in with Apple is gated on `APPLE_SIGN_IN=true` plus server client IDs.

### G6 — Reality & trust — BLOCKED (invariants PASS)
- Unchanged trust policy and tests.
- New this revision: journey impact refresh failures are now shown as stale (web and mobile) instead of silently keeping the last answer.

### G7 — Visual fidelity — BLOCKED (owner approval)
- Owner direction applied: dark navy + amber/gold on web and mobile from one palette (`src/theme/navy-amber.ts`).
- `tests/theme-parity.test.ts` enforces web == mobile tokens and WCAG AA for all text and state colours on all surfaces.
- Screenshots: desktop / tablet / mobile / landscape in `docs/release/evidence/local/`.
- Fixed defects:
  - tablet navigation wrapping (tab bar ≤ 900 px);
  - map attribution contrast;
  - landscape journey height under the tab bar.
- Not done: comparison against approved masters (missing), Dynamic Type 200 %, manual screen reader pass.

### G8 — SEO — NOT RUN (partial local PASS)
- `e2e/seo-crawl.mjs` (local): 17 pages (9 in sitemap), **0 issues**. It checks:
  - status, title, description, `lang=vi`, single h1, self canonical, JSON-LD parse;
  - private pages redirect or carry noindex and are absent from the sitemap;
  - non-production robots disallows.
- `e2e/perf.mjs` (Lighthouse 13 lab, local sandbox, simulated throttling). Evidence: `lighthouse.json`. Accessibility is 1.0 on every page.

| Page | Mobile perf | LCP | CLS | TBT | Budget misses |
|---|---|---|---|---|---|
| `/` | 0.87 | 3.5 s | 0 | 148 ms | LCP |
| `/di-dau` | 0.90 | 2.7 s | 0 | 277 ms | LCP |
| `/du-lieu` | 0.88 | 3.4 s | 0.06 | 132 ms | LCP |
| `/ban-do` | 0.34 | 8.6 s | 0.02 | 5.6 s | perf, LCP, TBT |

- The SEO category scores 0.66 only because non-production robots blocks crawling (`is-crawlable`). That is expected.
- The map page's TBT is dominated by MapLibre on software WebGL in the sandbox. It must be re-measured on QA with real devices.
- Fonts are the main LCP render-delay contributor on text pages. One weight was dropped. Moving to `next/font` with adjusted fallbacks is a recommended follow-up.
- Not run: crawl of the deployed QA site, field Core Web Vitals.

### G9 — Security & privacy — PASS (local + CI)
- Security gate:
  - `scripts/security-gate.mjs` is blocking in CI and now also audits `e2e/package-lock.json`. Tested in `tests/security-gate.test.ts` (5 cases).
  - **0 critical**. 4 advisories in 3 packages are documented exceptions (image-size, node-forge, decode-uri-component). The e2e tree has 0 advisories.
  - Run `40285133976` checked both production bundle source maps: image-size and node-forge absent; decode-uri-component present, which is the allowed `runtime-unreachable` case.
  - Nodemailer 10.2.1 removes the three addressparser advisories from the API image and the e2e mail stack.
  - braces and sprintf-js exceptions were removed because those advisories were withdrawn.
  - vitest critical issues remain fixed (2.1.9 → 4.1.12). postcss and uuid remain patched.
- Account recovery:
  - single-use hashed tokens with expiry and email binding;
  - no account enumeration;
  - reset revokes all sessions;
  - production SMTP must use TLS;
  - the outbox mail transport is refused in qa / production.
- Federated sign-in: native clients must bind a nonce.
- The web → API client identity is authenticated by `INTERNAL_PROXY_SECRET`. The header cannot be forged without the secret.
- Push payloads carry no coordinates. Push is consent-gated, and quiet hours are respected except for safety-critical alerts.

### G10 — End-to-end product — BLOCKED
- PASS locally:
  - open → discover → inspect → understand state;
  - decide → plan → start → arrive;
  - save / watch / report / verify;
  - recovery.
- Turn guidance:
  - Implemented from provider instructions only (TomTom, `vi-VN`); suspended off-route.
  - Not exercised end to end: the local routing double returns no guidance (by design), and TomTom needs the owner's key on QA.

### G11 — Release candidate — FAIL
QA is not deployed, and mandatory gates are not verified.
