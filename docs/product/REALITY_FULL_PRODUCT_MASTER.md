# REALITY — Full Product Master (V2 completion pass)

Status as of 2026-10-22, branch `feat/reality-v2-completion`. This document describes the product **as implemented and verified in git**, and labels everything else. It is not an approved visual or UX master.

## Provenance labels

| Label | Meaning |
|---|---|
| **VERIFIED IN GIT** | Present in the repository and exercised by a recorded test or E2E step. |
| **RECOVERED FROM DOCUMENTED DECISION** | Taken from an owner decision recorded in git (README, audit checkpoints, PR comments) or the V2 brief. |
| **PROPOSED RECONSTRUCTION** | Engineering proposal made in this pass because the owner contract is absent. Needs owner approval. Never an approved master. |
| **MISSING / UNVERIFIED** | Required input not available; status cannot be claimed. |

Contracts that are still **MISSING** (see `docs/audit/CHECKPOINT-02.md`): Full State Matrix V2, the Flow 06 "Đi đâu bây giờ?" UX contract, the Responsive Production Master / Journey G01 Visual Master V1, the Product V2 four-panel master, and a Stories contract. Every UI in this pass is a **PROPOSED RECONSTRUCTION** of those masters.

## 1. Product loop

Reality → Context → Decide → Journey → Stories → Contribution → Reality (**RECOVERED FROM DOCUMENTED DECISION**: V2 brief).

| Stage | What the user gets | Status |
|---|---|---|
| Reality | Per-place and per-area state across 9 domains (road, weather, parking, open, crowd, queue, price, activity, vehicle), each with truth (KNOWN / UNKNOWN / CONFLICT), freshness, source, nature (observation / forecast / community report / schedule) and safety | VERIFIED IN GIT (state engine unit tests, API integration tests, E2E place + map steps) |
| Context | Map explorer, place pages, area pages, pulse ledger, data-source page | VERIFIED IN GIT (web E2E desktop / mobile / landscape) |
| Decide | Intent + location → ranked options with reasons, unknowns and travel estimate | VERIFIED IN GIT; ranking rules are a PROPOSED RECONSTRUCTION (Flow 06 contract MISSING) |
| Journey | Route via routing provider, active journey, impact checks along the route, arrive / stop, share link | VERIFIED IN GIT locally with a **development straight-line routing double**; real provider (TomTom) needs a key → UNVERIFIED |
| Stories | User stories about places/areas, moderated, public pages | VERIFIED IN GIT (API + web); contract is a PROPOSED RECONSTRUCTION |
| Contribution | Reports with trust policy, corroboration, votes, moderation, watch notifications | VERIFIED IN GIT (integration tests + E2E two-contributor flow) |

## 2. Trust and honesty rules (enforced in code)

**RECOVERED FROM DOCUMENTED DECISION** (README invariants, V2 brief §"Never fabricate"), implemented in `src/reality/state-engine.ts` (`TRUST_POLICY_VERSION 2026-10-22.1`):

1. No active evidence → **UNKNOWN**, never "clear" or "safe".
2. A single community report never becomes KNOWN; it is shown as *"đã báo cáo, chưa xác minh"*.
3. KNOWN from community data requires ≥ 2 distinct contributors agreeing; the same contributor twice counts once.
4. An authoritative / high-reliability source can establish KNOWN alone; forecast data keeps its FORECAST nature.
5. Credible disagreement is **CONFLICT** with safety NONE; conflict is independent of freshness.
6. Safety levels (CAUTION / AVOID / BLOCKED) are only derived from KNOWN states.
7. Freshness windows are per-domain policy in `src/reality/catalog.ts`.
8. Development fixtures are refused in `qa` / `production` (`ALLOW_DEV_FIXTURES`, `DEV_FAKE_ROUTING` rejected by config); `tests/no-fake-data-leak.test.ts` guards that fixture data never reaches production responses.
9. Impact severity (INFO / MINOR / SIGNIFICANT / SAFETY_CRITICAL) uses explicit thresholds; uncertainty never escalates past MINOR on its own.

GPS display policy (**RECOVERED FROM DOCUMENTED DECISION**, owner-approved): future skew ≤ 2000 ms accepted, > 2000 ms rejected, age > 30 s rejected, explicit `mocked=true` is never READY, missing mock metadata stays UNKNOWN (`src/location/gps-quality.ts`, `APPROVED_DISPLAY_FIX_POLICY`).

## 3. Real-world data — honest coverage

| Domain | Source | Nature | Status |
|---|---|---|---|
| Places, opening-hours schedule | OpenStreetMap via Overpass (ODbL, attributed) | SCHEDULE (published hours, not live "open now") | Adapter + tests VERIFIED IN GIT; live fetch **UNVERIFIED** (sandbox cannot reach Overpass) |
| Weather | Open-Meteo | FORECAST (model), commercial use RESTRICTED by licence | Adapter VERIFIED IN GIT; live fetch **UNVERIFIED** |
| Road, parking, crowd, queue, open-now | Community reports only | COMMUNITY_REPORT | VERIFIED IN GIT |
| Traffic, flood sensors, parking occupancy, transit, events | **No licensed feed** | — | MISSING — the product says "chưa rõ" instead of inventing values |
| Routing / geocoding | TomTom (feature-gated) | — | Requires `TOMTOM_API_KEY` → UNVERIFIED |

## 4. Surfaces

- **Web** (`apps/web`, Next.js 16): public discovery, map, place, area/category pages, Decide (`/di-dau`), journeys, stories, account (saved, watch, notifications, reports, stories, settings, privacy/export/delete), admin console (`/quan-tri/*`: dashboard, moderation, conflicts, sources, ingestion, readiness, users, stories, incidents, feature flags, audit log), SEO (sitemap, robots gated by `SITE_INDEXING`, JSON-LD, canonical). VERIFIED IN GIT (E2E 20/20).
- **Mobile** (`apps/mobile`, Expo SDK 54): auth in secure storage, home pulse, place now, report, decide, journeys, watch, account. Production JS bundles export for Android and iOS (VERIFIED IN GIT). Native build, store submission and device testing **UNVERIFIED** (no EAS / SDK / device).
- **API** (`apps/api`): 85 OpenAPI operations (`docs/api/openapi.json`), PostGIS, forward-only migrations, ingestion worker, retention job.

## 5. Not implemented / external dependencies

| Item | Reason |
|---|---|
| Email verification and password reset | No email provider configured |
| Push notifications (FCM / APNs) | No credentials; in-app notifications work |
| Google / Apple sign-in | Verifier implemented and flag-gated; client IDs absent |
| AI assistant | Feature flag only; no LLM provider configured — not implemented |
| Report photos | No object storage configured |
| Turn-by-turn guidance on mobile | Routing provider guidance not requested; route + impact only |

## 6. Open owner decisions

1. Approve or replace the reconstructed UI (web "Calm Cartographic" tokens in `src/theme/tokens.ts`) and supply the missing masters.
2. Mobile palette (navy / amber) diverges from web tokens — choose one.
3. Flow 06 ranking contract and Stories contract.
4. Paid / licensed providers: TomTom key, email, push, live traffic or flood feed.
5. QA environment on Railway for live ingestion verification (no app-map project exists yet).
