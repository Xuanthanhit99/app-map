# CHECKPOINT 03: QA integration and release-gate recovery

- Date: 2026-10-22
- Branch: `feat/reality-v2-completion`, Draft PR #5 (not merged)
- Starting HEAD: `c3e14b4`
- Brief: "REALITY V2 — QA INTEGRATION & RELEASE GATE RECOVERY"

## Commits in this pass

| Commit | Scope |
|---|---|
| `99fe383` | Enforced dependency security gate. vitest 2.1.9 → 4.1.12 (removes 2 critical advisories), postcss and uuid patched. 6 advisories documented with bundle verification |
| `b36e4f8` | Railway config-as-code, Dockerfiles, authenticated web→API client hop (`INTERNAL_PROXY_SECRET`) |
| `312151a` | Email verification, password reset and recovery, push delivery, native OAuth with nonce, deep links / App Links, provider turn guidance, stale-impact disclosure, mobile export / security / location screens |
| `06a5b8f` | Navy + amber across web and mobile (one palette, parity and contrast tests), tablet layout fix, recovery E2E |
| `4678f78` | Page-scoped MapLibre CSS, font trim, CLS fix; SEO crawl + Lighthouse tooling; manual native QA build workflow |
| (this commit) | Release evidence docs, E2E discovery mode for QA, CI path filter |

## Verification

| What | Result |
|---|---|
| Typecheck (core, API, mobile, web) | exit 0 |
| Tests (local, PostGIS) | 54 files / 377 tests PASS |
| CI run `39745834087` @ `4678f78` | **success**: install, typecheck, tests with PostGIS service, web build, Android / iOS exports with source maps, **blocking security gate**, gate report artifact uploaded (826 B) |
| Browser E2E (local) | 26/26 PASS, 0 console errors, 0 serious axe findings; also 26/26 in `E2E_FIXTURES=false` discovery mode |
| SEO crawl (local) | 17 pages, 0 issues |
| Lighthouse lab (local) | Accessibility 1.0 everywhere; mobile perf 0.87–0.90 on text pages; map page heavy (see `RELEASE_GATES.md`) |
| Security gate (local + CI) | PASS: 0 critical; 6 documented exceptions; build-tool exceptions verified absent from bundles |

CI job logs and artifacts cannot be downloaded from this sandbox (blob storage blocked). The step results come from the GitHub API.

## Blocked (external)

1. **Railway QA.** Owner approved "sleep when idle". Every `create-project` call returned "Deploys have been paused due to an upstream issue". Nothing was created or billed. The runbook is in `docs/release/QA_DEPLOYMENT.md`.
   - Attempts on 2026-10-22: the session's attempts between 07:12 and 08:17 UTC, plus a scheduled retry at 09:18 UTC. All returned the same error.
2. **TomTom key.** The owner said they will add it to the QA API service. It is required for real routing and guidance.
3. **Native.** No Android SDK path (Gradle/Maven unreachable), no Apple credentials, no devices. The manual APK workflow is ready.
4. **Visual masters.** Still missing, so G7 cannot pass without owner approval.
5. **Push / OAuth / App Links.** These need EAS projectId, FCM/APNs, Google/Apple client IDs, signing fingerprints and the Apple team ID.

## Next actions (in order)

1. Retry `reality-qa` creation once Railway resumes deploys, then follow the runbook.
2. Run E2E / SEO / Lighthouse against QA (`E2E_FIXTURES=false`, `MAILPIT_URL`, `EVIDENCE_DIR=qa`).
3. Owner sets `TOMTOM_API_KEY`; verify a real route plus Vietnamese guidance.
4. Run "Native QA build" with the QA URLs; install on an Android device.
