# Checkpoint 01 — Repository audit & P0 fixes

Date: 2026-10-18 · Base: `feat/production-foundation@dbe7c8f` (PR #1) · Branch: `fix/p0-audit-checkpoint-1`
Environment: Linux cloud workspace, Node 22. **No Android emulator, iOS simulator, physical device, browser screenshot tooling, TomTom key or evidence feed available.**

## 1. What was inspected

- Branches: `main@c5915eb` (CI bootstrap only), `feat/production-foundation` (all product code, 314 commits, PR #1), `ci/*` PRs #2–#4.
- Workspaces: core contracts (`src/`), API (`apps/api`, plain `node:http`), Expo SDK 54 app (`apps/mobile`, expo-router, MapLibre native / Leaflet web), static desktop shell (`apps/desktop`).
- Docs: `README.md`, `apps/api/EVIDENCE_FEED.md`. **No ADRs, no Full State Matrix V2 document, no Flow 06 UX contract, no Responsive Production Master images exist in the repo.** The LOCK rules are only present as code + README invariants.
- No database, no auth service, no worker, no deployment target (Railway has no app-map project).

## 2. Gate A evidence (local)

| Check | Result |
|---|---|
| `npm install` | PASS |
| `vitest run` baseline | PASS 182/182 (35 files) |
| `npm run typecheck` (core + api + mobile) | PASS |
| `expo export --platform android` | PASS, Hermes bundle 2.89 MB (before and after fixes) |
| `vitest run` after fixes | PASS 201/201 (36 files) |
| iOS export | NOT RUN this checkpoint |
| Lint | NOT CONFIGURED (no eslint in repo) |

API runtime smoke (no provider keys): `/health/live` 200, `/health/ready` 503 degraded, pulses/plans return `empty` + `UNKNOWN` (no fabricated data), consent-less query 400, oversized body 413, bad JSON 400, disallowed Origin 403, aborted body does not crash the process, rate limit 429 after 90 req/min/peer.

## 3. Product Completion Matrix

| Module | Implementation | Functional QA | Visual QA | Production | Blocker |
|---|---|---|---|---|---|
| Reality | IMPLEMENTED / UNVERIFIED — home VM, map, pulses endpoint (always empty) | Unit only | VISUAL BLOCKED — MASTER EVIDENCE MISSING | NOT STARTED | No licensed evidence feed; no device run |
| Context | IN PROGRESS — GPS lifecycle + quality contracts, consent preference | Unit + hook race tests | BLOCKED | NOT STARTED | Emulator GPS provider (see §5) |
| Decide (Flow 06) | IN PROGRESS — consent query API + client + Journey card | Unit + integration (mocked) | BLOCKED — Flow 06 contract not in repo | NOT STARTED | Flow 06 UX contract missing; feed missing |
| Journey | IN PROGRESS — place search, TomTom route preview, start gate (fail-closed) | Unit; real routing only via manual workflow | BLOCKED | NOT STARTED | Active navigation intentionally disabled; no TomTom key here |
| Stories | NOT STARTED | — | — | — | No approved contract |
| Contribution | IN PROGRESS — moving-safe contract + placeholder screen, no submit API | Unit only | BLOCKED | NOT STARTED | No backend, no approved UX |
| Authentication | NOT STARTED (no user auth; feed uses server bearer token only) | — | — | — | Needs product decision |
| Data / API | IMPLEMENTED / UNVERIFIED — stateless gateway, no DB | Unit + local smoke PASS | n/a | NOT READY | Rate limit keyed on socket peer (see §6); no deploy |
| Native Mobile | IMPLEMENTED / UNVERIFIED — Android JS export PASS | Not run on device | BLOCKED | NOT STARTED | No emulator/device in this environment |

No module is FUNCTIONAL PASS or better: none has been executed end-to-end on a real target with real data.

## 4. Fixes in this checkpoint

| # | Bug (reproduced) | Root cause | Fix | Regression test |
|---|---|---|---|---|
| 1 | `safetyLevel: BLOCKED` + `truthStatus: UNKNOWN` rendered tone `uncertainty`; `EMPTY` + `BLOCKED` rendered `muted`, while `CONFLICT` + `BLOCKED` correctly rendered `danger` | UNKNOWN and EMPTY branches overwrote tone, violating the resolver's own precedence #1 (hard safety) | `tone = safetyTone ?? …` in both branches. UNKNOWN badge/copy unchanged (Unknown ≠ Safe kept); CONFLICT without safety still not danger | 3 tests fail on old code, pass now |
| 2 | Route ETA showed `1 giờ 60 phút` for 7170 s; summary row showed `120 phút` style for long routes | hour/minute split rounded the remainder independently | `formatDurationVi` rounds total minutes first; invalid duration renders "Chưa rõ thời gian" instead of a number | table + 12k-sample sweep |
| 3 | Journey: initial context-free `GET /v1/decision/plans` could resolve after a consented query and overwrite its result with `INSUFFICIENT_CONTEXT` | initial load had no epoch guard; only the query had one | shared latest-wins gate for both requests, invalidated on unmount | gate unit test + source guard |

Files: `src/presentation/presentation-resolver.ts`, `apps/mobile/app/(tabs)/journey.tsx`, `apps/mobile/src/features/journey/{formatDuration,latestRequestGate}.ts`, `tests/p0-audit-checkpoint-1.test.ts`, `scripts/gps-emulator-diagnose.ps1`.

## 5. GPS / Android emulator blocker

Status: **BLOCKED — no emulator access from this environment.** Application location logic was not modified.

Code-level observation (hypothesis, not proven): the hook calls `watchPositionAsync` with `Accuracy.Balanced`. On Android that is a fused, balanced-power request, which may not register an active request on the `gps` provider. `Number of location reports = 0` on the gps provider is then expected and does not by itself prove a provider fault. `scripts/gps-emulator-diagnose.ps1` checks exactly this (active requests before/after `geo fix`). Changing accuracy would be an app-logic change and needs approval.

Manual steps on Windows, in order:
1. `adb devices -l` → emulator in `device` state.
2. Device Manager → AVD ▸ Cold Boot Now (no Wipe Data).
3. Extended Controls ▸ Location ▸ enable GPS signal ▸ Set Location.
4. `powershell -ExecutionPolicy Bypass -File scripts\gps-emulator-diagnose.ps1` (remember `geo fix` is **lon lat**).
5. Only if gps/fused shows a last location → run Reality location E2E.
6. Still zero with an active gps request → create a clean AVD (Google Play image, API 34/35); keep the old one.

## 6. Risks found, not changed (need decision)

- **Rate limiter behind a proxy**: keyed on `socket.remoteAddress`. Behind Railway/any LB every user shares one bucket (90 req/min total). Needs an explicit trusted-proxy contract before deploy.
- **GPS display gate has zero future-skew tolerance** (`observedAt > evaluatedAt` → reject). Real devices with slight GNSS/system clock skew could have every fix rejected. Needs device evidence before any change.
- `apps/mobile/src/infrastructure/location/foreground-location.ts` is unused and promotes a 60 s cached fix to `READY`, contradicting the watcher contract. Recommend deletion (dead code) — pending approval.
- Home pulse typography uses 8–10 pt text; likely fails Dynamic Type / contrast review once masters are available.
- No lint gate; `package-lock.json` is not committed (CI `npm install` is non-reproducible).

## 7. Next priorities

1. User-side: run the GPS diagnostic script and share output.
2. User-side: add Full State Matrix V2, Flow 06 UX contract and Responsive Production Master images to `docs/` — Visual QA and Decide cannot pass without them.
3. P0: trusted-proxy rate-limit contract; iOS export gate; ESLint + lockfile for reproducible CI.
4. P1: Contribution submit API contract (proposal only, awaits approval); Stories contract proposal.
