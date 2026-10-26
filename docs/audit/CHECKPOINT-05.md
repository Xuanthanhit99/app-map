# CHECKPOINT 05: local QA stack, visual package, map lab

- Date: 2026-10-26 (Asia/Bangkok, UTC+7)
- Branch: `feat/reality-v2-completion`, Draft PR #5 (not merged, not deployed, not submitted to a store)
- Verified starting HEAD: `5b1bb156494f570aef01619c52a8840198e6d154` (equal to `origin/feat/reality-v2-completion`). CI run `40285556100` on that commit had already succeeded.
- Implementation commit: `b136268e7deb0fa14755f78e6d336148bac1bf9c`
- This file, the screenshots, the crawl and the Lighthouse JSON are the evidence commit that follows `b136268`.

## What this pass did

| Area | Result |
|---|---|
| Railway `reality-qa` | Not created. Rechecked 14:50 Asia/Bangkok: GraphQL HTTP 400, no `RAILWAY_TOKEN`. Nothing billed. Production not touched |
| Local QA stack | PostGIS `reality_qa`, API `APP_ENV=qa` on `127.0.0.1:3011`, ingestion worker, Next production server on `127.0.0.1:3000`, local SMTP catcher on `127.0.0.1:1025` (HTTP list on `8025`). Mailpit the product is not installed; the API used `MAIL_TRANSPORT=smtp` against this catcher. No fake routing |
| Ingestion | Worker region `qa-hoan-kiem` bbox `105.84,21.02,105.85,21.03`. Open-Meteo SUCCEEDED (1 cell) at 14:51 Asia/Bangkok. Overpass SUCCEEDED 262 records in the same minute. `places` count 262. Licence on the public API: ODbL-1.0, © OpenStreetMap contributors |
| Auth | Register `verificationEmail: SENT`. Confirm `VERIFIED`. Refresh rotation; reuse `REFRESH_TOKEN_REVOKED`. Anonymous admin 401. User admin 403. Forgot/reset via the catcher; old password 401; export `reality-export/1`; delete 204; later login 401. Log: `docs/release/evidence/local/qa05/qa-flow.json` |
| TomTom | No `TOMTOM_API_KEY`. `POST /v1/routing/route` returned 503 `ROUTING_PROVIDER_NOT_CONFIGURED`. No route was invented |
| Web screenshots | 24 captures at 1536, 820, 390 and landscape 844. Package: `docs/release/VISUAL_APPROVAL_PACKAGE.md`. G7 not approved |
| Native | Still no Android SDK, Gradle, `eas`, or Apple credentials. No APK/IPA. No device screenshots |
| SEO | `WEB_URL=http://127.0.0.1:3000 node e2e/seo-crawl.mjs` at 14:54 Asia/Bangkok: 17 pages, 9 sitemap URLs, 0 issues, robots disallow-all. This is the local server, not a deployed crawl |
| Lab CWV | Lighthouse 13.5.0, system Chrome, simulated throttling, 14:58 Asia/Bangkok. `docs/release/evidence/local/qa05/lighthouse.json`. Not field data. Not the same Chrome binary as the 2026-10-22 run |
| Tests | `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npx vitest run` → 56 files, 381 tests, 0 failures (14:57 Asia/Bangkok). The two new tests are `tests/map-render-options.test.ts` |

## Commands that matter

| Command | Result |
|---|---|
| `curl` GraphQL `https://backboard.railway.com/graphql/v2` | HTTP 400, body `Problem processing request` |
| API `/health/ready` | 200 ready, database true, postgis true, migrations 6, `routingConfigured` false, `env` qa. `ingestionEnabled` false on the API process; the worker process logged `ingestion: true` |
| Worker `tsx scripts/worker.ts` with `INGESTION_ENABLED=true` and the Hoàn Kiếm region | open-meteo SUCCEEDED upserted 1; osm-overpass SUCCEEDED upserted 262 |
| `node e2e/seo-crawl.mjs` | 0 issues |
| `npx vitest run` with `TEST_DATABASE_URL` | 56 / 381 pass |

## Map and font change (`b136268`)

- `next/font/local` loads Be Vietnam Pro woff2. Vietnamese, latin-ext and latin are separate families because this Next build applies one `unicode-range` to every file in a single `localFont()` call. The CSS stack is vietnamese, then latin-ext, then latin, so a glyph comes from the first family that contains it.
- Preload is on for vietnamese and latin (weights 400, 600, 700). latin-ext is available and not preloaded. The home capture recorded those six preload URLs and `fontVietnamese` / `fontLatin` / `fontLatinExt` all loaded.
- `mapRenderOptions()` sets `fadeDuration: 0`, `pixelRatio` capped at 2, and `localIdeographFontFamily` for CJK. Used by the explorer, the mini map and the journey map.
- Short landscape (`max-height: 520px`) uses a side rail instead of a 55% bottom sheet. `landscape-844-map.png` is the recapture.

## Lab numbers (do not treat as a pass)

Mobile, simulated throttling, this machine's Chrome:

| Page | Perf | LCP | CLS | TBT | Budget misses |
|---|---|---|---|---|---|
| `/` | 0.93 | 3.14 s | 0 | 29 ms | SEO score, LCP |
| `/di-dau` | 0.92 | 3.27 s | 0 | 27 ms | SEO score, LCP |
| `/du-lieu` | 0.91 | 3.34 s | 0 | 107 ms | SEO score, LCP |
| `/ban-do` | 0.65 | 3.16 s | 0.018 | 1.79 s | performance, SEO score, LCP, TBT |

The SEO category is 0.66 because non-production robots disallow crawling (`is-crawlable`). That is intentional. Accessibility is 1.0 on these four pages. `/ban-do` is less blocked than the 2026-10-22 lab row (perf 0.34, LCP 8.6 s, TBT 5.6 s) but the Chrome binary differs, so this is a new measurement, not a controlled A/B. It still misses the lab budget. Field CWV on a deployed host was not run.

## Still blocked

- Railway token, then the approved sleep-when-idle project. Cost approval from 2026-10-22 still stands and was not spent.
- `TOMTOM_API_KEY` on that QA stack. Routing stays 503 until then.
- Owner visual decision (package above).
- Android SDK or the manual native workflow against a real QA URL, plus a device. iOS needs an Apple team and EAS credentials.
- Deployed SEO crawl and field Core Web Vitals.

Recommendation remains **NOT READY**. G11 stays FAIL.
