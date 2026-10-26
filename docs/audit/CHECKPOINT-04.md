# CHECKPOINT 04: QA integration and release-gate recovery (continuation)

- Date: 2026-10-26 (Asia/Bangkok, UTC+7)
- Branch: `feat/reality-v2-completion`, Draft PR #5 (not merged, not deployed to production)
- Starting HEAD observed in this environment: `215b144` (the brief's `c3e14b4` is an earlier commit on the same branch; GitHub HEAD had already moved)
- Brief: "REALITY V2 — QA INTEGRATION & RELEASE GATE RECOVERY"

Code commit: `2524b87`. This file is the evidence commit on top of it.

## What changed in this pass

| Area | Result |
|---|---|
| Dependency gate | Nodemailer 10.0.16 → **10.2.1** in the API image and, via an npm override, in the separate `e2e/` lockfile (mailparser and smtp-server had pinned 10.0.14). That removes GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w and GHSA-85x2-q946-cp5h from both trees |
| Exceptions | braces GHSA-vfj7-8cjw-p6xm and sprintf-js GHSA-hp3w-g68c-fv3c were **withdrawn** by the GitHub Advisory Database (2026-10-23 and 2026-10-22). They are no longer excepted. image-size, node-forge and decode-uri-component were re-checked against current source and stay excepted |
| Gate scope | `scripts/security-gate.mjs` now audits the workspace lockfile **and** `e2e/package-lock.json`. Critical still cannot be excepted |
| Account deletion UI | The web confirmation dialog says a Google/Apple account with no password may leave the password blank. The API already allowed that |
| Railway `reality-qa` | Not created. See below |
| Production | Not modified |

## Commands and results (local)

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 (core, API, mobile, web) |
| `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npx vitest run` | **55 files, 379 tests, 0 failures** (PostgreSQL 16.x + PostGIS 3.4) |
| `node scripts/security-gate.mjs --report docs/release/evidence/security/audit-gate.json` | **PASS**. Root: 0 critical, 4 advisories in 3 packages, all excepted. `e2e`: 0 advisories. Checked 2026-10-26 14:11 Asia/Bangkok |
| QA config refusals (`APP_ENV=qa` plus `ALLOW_DEV_FIXTURES=true`, `DEV_FAKE_ROUTING=true`, `MAIL_TRANSPORT=outbox`) | each process exit 1 with `DEV_FIXTURES_FORBIDDEN_IN_QA`, `DEV_FAKE_ROUTING_FORBIDDEN_IN_QA`, `MAIL_OUTBOX_FORBIDDEN_IN_QA` |
| Live ingestion into database `reality_qa` (`APP_ENV` not used; adapters called directly after `migrate`) | 6 migrations applied. Open-Meteo **SUCCEEDED** (1 cell, value recorded). Overpass first attempt **FAILED** `HTTP_502` (2 attempts). Retry **SUCCEEDED**: 67 cafes in bbox `105.84,21.02,105.85,21.03`, licence ODbL-1.0, attribution © OpenStreetMap contributors |
| QA API on `127.0.0.1:3011` (`APP_ENV=qa`, `MAIL_TRANSPORT=none`, no TomTom key) | `/health/ready` 200: database, PostGIS, migrations 6, `routingConfigured: false`, `env: qa`. Register 201 with `verificationEmail: UNAVAILABLE`. Refresh rotated; reuse of the old refresh token returned 401 `REFRESH_TOKEN_REVOKED` and revoked the family. Anonymous admin 401 `UNAUTHENTICATED`. Signed-in user admin 403 `INSUFFICIENT_ROLE`. Export 200 `reality-export/1`. Delete 204; later login 401; `users` count 0. `POST /v1/routing/route` 503 `ROUTING_PROVIDER_NOT_CONFIGURED` (straight-line routing was not used). Forgot-password 503 `EMAIL_DELIVERY_UNAVAILABLE` because no SMTP catcher was configured for this boot |

CI for this commit is not yet recorded. The last green run remains `39745834087` on `4678f78`.

## Railway

- `https://backboard.railway.com/graphql/v2` answered HTTP 400 to an empty request at 2026-10-26 14:12 Asia/Bangkok. That is an API response, not the 2026-10-22 body "Deploys have been paused due to an upstream issue".
- This environment has no `RAILWAY_TOKEN`. `gh secret list` returned HTTP 403 (the GitHub token cannot read Actions secrets).
- No Railway project, service, database or domain was created. Nothing was billed. Production was not touched.
- Config-as-code in `deploy/railway/` is unchanged and still the way to create `reality-qa` once a token is available. Owner cost approval ("sleep when idle", about $5–10/month) still stands; it was not spent.

## Still blocked

1. Deployed `reality-qa` (needs the owner's Railway token). TomTom key, live routing and Vietnamese guidance stay unverified.
2. Installable Android/iOS builds. This machine has Java 21 and does not have the Android SDK, Gradle, `eas`, or an `ANDROID_HOME`. No device. Expo export is still not a device test.
3. Visual masters and owner approval of the Night Chart reconstruction. No new screenshots were taken; G7 stays blocked.
4. Deployed SEO crawl and field Core Web Vitals.
5. Push, native OAuth and App Links credentials (EAS project, FCM/APNs, Google/Apple client IDs, signing fingerprints, Apple team).
