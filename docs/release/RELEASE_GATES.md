# Release Gates — G0 to G11

Gate definitions come from the V2 brief §14. A gate is marked PASS only when its full definition was met with recorded evidence. Local runs that support a gate without meeting its environment requirement are listed as supporting evidence, not as PASS.

**Run context (this revision)**
- Commit: `4678f78` on `feat/reality-v2-completion` (Draft PR #5). Earlier record: `bdb769b` / `c3e14b4`.
- Date: 2026-10-22.
- Local environment: Linux sandbox, Node 22.22, PostgreSQL 16 + PostGIS 3.4.
  - API: `APP_ENV=development`, dev fixtures, `DEV_FAKE_ROUTING=true`, `MAIL_TRANSPORT=smtp` to a local SMTP sink, `INTERNAL_PROXY_SECRET` set.
  - Web: `next start` production build.
- The sandbox cannot reach Overpass, Open-Meteo, OSM tiles, TomTom, Gradle/Maven, the Expo API or `*.railway.app`.
- QA (`reality-qa` on Railway): approved by the owner, but **not created**. Railway answered "Deploys have been paused due to an upstream issue" on every attempt (see `QA_DEPLOYMENT.md`).

## Summary

| Gate | Status | Reason |
|---|---|---|
| G0 Repository & contract recovery | **PASS** | Unchanged; masters still missing |
| G1 Backend | **PASS (local + CI)** | 54 files / 377 tests incl. PostGIS; CI run `39745834087` success on `4678f78` |
| G2 Data readiness | **BLOCKED** | No QA environment (Railway incident); live ingestion unverified; no licensed live traffic / flood / parking feeds |
| G3 Web functional | **BLOCKED** | 26/26 browser E2E PASS locally (desktop, tablet, mobile, landscape); the gate requires real QA APIs |
| G4 Native Android | **BLOCKED** | JS bundles only. An installable debug-signed APK workflow exists (manual), but it needs the QA URL; no device testing |
| G5 Native iOS | **BLOCKED** | Needs Apple signing / EAS credentials and a device |
| G6 Reality & trust | **BLOCKED** | Invariants PASS; State Matrix V2 still missing |
| G7 Visual fidelity | **BLOCKED** | Navy + amber reconstruction applied across web and mobile; screenshots at 1536 / 820 / 390 / landscape; **owner approval required**, masters missing |
| G8 SEO | **NOT RUN** (partial local PASS) | Local crawl 17 pages / 0 issues; Lighthouse lab run done; deployed crawl and field CWV not run |
| G9 Security & privacy | **PASS (local + CI)** | Enforced security gate (0 critical, 6 documented exceptions); recovery and verification flows E2E PASS |
| G10 End-to-end product | **BLOCKED** | Full loop PASS locally with fixtures + straight-line routing; real routing / QA data needed |
| G11 Release candidate | **FAIL** | G2–G8 and G10 unverified; QA not deployed |

**Recommendation: NOT READY.**

## Details

### G1 — Backend — PASS (local + CI)
- Commands:
  - `npm run typecheck` (exit 0)
  - `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npx vitest run` → **54 files, 377 tests, 0 failures**
- New coverage in this revision:
  - account recovery: verification, reset, expiry, single use, email binding, enumeration resistance, session revocation, change notices;
  - federated sign-in with nonce binding;
  - push dispatch: consent, quiet hours, priority, dead-token disable, no coordinates in payload;
  - provider turn guidance parsing and the guidance engine;
  - mail / push config safeguards, internal-hop client identity, security gate behaviour, palette parity and contrast.
- When `TEST_DATABASE_URL` is set and the database is unreachable, the integration tests **fail**; they do not skip. Observed locally. The CI job sets it.
- CI record:
  - Run `39724229411` succeeded on `c3e14b4`.
  - Run `39745834087` succeeded on `4678f78`. It covered the PostGIS integration tests, web build, Android / iOS exports with source maps, and the **blocking security gate** (step success; report artifact uploaded). Logs and artifacts cannot be downloaded from the sandbox.

### G2 — Data readiness — BLOCKED
- QA environment not created (Railway platform incident).
- Adapters verified only against recorded payloads.
- To unblock, follow the runbook in `QA_DEPLOYMENT.md`.

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
  - `scripts/security-gate.mjs` is blocking in CI. Tested in `tests/security-gate.test.ts`.
  - **0 critical**; 6 advisories in 5 packages are documented and verified absent from shipped bundles, except one runtime-unreachable case (see `SECURITY_FINDINGS.md`).
  - vitest critical issues fixed (2.1.9 → 4.1.12). postcss and uuid patched.
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
