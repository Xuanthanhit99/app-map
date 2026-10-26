# Checkpoint 02 — Contract recovery, P0 hardening, evidence-based completion

Date: 2026-10-18 · Base: `fix/p0-audit-checkpoint-1@b08884f` · Commit: local only (no push, no PR, no Actions)
Environment: Linux cloud workspace, Node 22. No emulator, simulator, device, screenshot tooling, TomTom key, evidence feed or Railway service for app-map.

## 1. Contract Recovery Matrix

Sources searched: full Git history (all branches, root commits reached), every file ever added, PR #1–#4 bodies and comments (REST API), GitHub issues, Claude Project "App-map" docs, Google Drive full-text search, Railway projects.

| Contract | Source found | Version | Verification | Missing | Impact |
|---|---|---|---|---|---|
| Full State Matrix V2 | **None.** Only fragments in code: `src/domain/state-model.ts` (6 dimensions), README + PR #1 body ("Locked invariants represented") | Unknown (code says "Composable State Model", never "V2") | NOT VERIFIED — code cannot be checked against a document that is absent | Full matrix rows/cells, precedence table, modifier rules per cell | State logic can only be checked against README invariants. Every state-presentation claim stays IMPLEMENTED / UNVERIFIED |
| Flow 06 — Đi đâu bây giờ? | **None.** Only a UI label in history ("Chọn giúp tôi sẽ mở ở Flow 06 — Chưa khả dụng") | — | BLOCKED | Entire UX contract: steps, states, copy, ranking rules, consent | Decide stays IN PROGRESS. Current consent query is engineering-safe but not contract-verified. No Flow 06 UI work is authorized |
| Responsive Production Master | **None in repo / Project / Drive.** PR #1 comment (2026-10-17) cites "Journey G01 Visual Master V1 (user supplied 2026-10-17)" and a separate "Product V2 four-panel master" — neither is accessible here | G01 V1 (referenced only) | VISUAL BLOCKED — MASTER EVIDENCE MISSING | Image files for small phone, 390, tablet, landscape, Dynamic Type 200 %, desktop 1536 | No Visual QA is possible. `src/responsive/layout-contract.ts` encodes container rules but they cannot be checked against a master |
| Presentation Resolver precedence | Code docstring `src/presentation/presentation-resolver.ts` (8-level order) + PR #1 body | Implicit, PR #1 | PARTIALLY VERIFIED — the code is internally consistent after the CP01 safety fix. No external document confirms the order | Modifier contract per level | Order is treated as the de-facto contract. No changes were made to it beyond the CP01 safety-tone fix |
| Reality → Context → Decide → Journey → Stories → Contribution | Master prompt (this engagement) + README "Next implementation slices" | — | PARTIALLY VERIFIED — the 6 stages exist as product intent. README has a different slice list (Reality Home, Active Journey, Sheet, Place Now, Contribution) | Stories contract entirely; hand-off data contracts between stages | Stories NOT STARTED and needs a contract proposal |
| Evidence feed / Decision API | `apps/api/EVIDENCE_FEED.md` | In repo | VERIFIED against code + local smoke (CP01) | Licensed real feed | Functional only with an empty feed |

No document was rewritten or labelled LOCKED. Recovery remains BLOCKED on user-held artifacts.

## 2. Rate limit P0 — FIXED (opt-in trust, safe default)

**Trace.** `server.ts` → `applyApiGuards` → `checkRateLimit(request.socket.remoteAddress)`. No forwarded header was read (good), but behind any proxy every user shares the proxy peer's bucket (90 req/min for everyone). This was a DoS-by-design once deployed.

**Railway facts** (docs.railway.com/networking/public-networking/specs-and-limits): the edge sets `X-Real-IP` to the client's remote IP. There is no app-map project on Railway yet, so no live proxy config exists to read.

**Trust boundary.** Forwarded headers are client-controlled unless written by a proxy we trust. The new `apps/api/src/client-identity.ts` has three modes:
- `TRUST_PROXY=none` is the default. It uses the socket peer and ignores all forwarded headers, which is the previous behaviour.
- `TRUST_PROXY=railway` uses `X-Real-IP`. Only use it when the edge is the sole ingress.
- `TRUST_PROXY=xff` with `TRUSTED_PROXY_HOPS=N` uses the N-th address from the right of the forwarded chain. Client-written left entries are never used.

**Anti-spoofing measures:**
- Optional `TRUSTED_PROXY_CIDRS` pins header trust to the proxy network. A direct peer outside it falls back to socket-peer identity.
- A missing, malformed, multi-value or duplicated trusted header goes to one shared "unattributed" bucket per peer. Stripping the header therefore cannot evade the limit.
- IPv4-mapped IPv6 is collapsed. IPv6 is keyed per /64, so rotating addresses within one allocation shares a bucket.
- Invalid config makes startup fail closed.
- The rate-limit key (which may contain an IP prefix) is never logged.

**Multi-replica.** The limiter is in-memory per process. With N replicas the effective per-client limit is up to N × 90/min. This is documented in `EVIDENCE_FEED.md`. A shared store (e.g. Redis) is required before relying on horizontal scaling for abuse control. It was not built because there is no infrastructure decision yet.

**Evidence:**
- 34 new tests: spoofed headers, many clients behind one proxy, untrusted peer, xff hops, malformed headers, invalid config, guard integration.
- Live server checks:
  - `railway` mode: client A got 90×200 + 5×429, then client B got 200.
  - default mode: 95 requests with rotating spoofed XFF/X-Real-IP got 90×200 + 5×429, so the headers were ignored.
  - `TRUST_PROXY=all` fails startup with `INVALID_TRUST_PROXY`.

## 3. GPS timestamp gate P0 — ANALYSED, PROPOSAL ONLY (no policy change)

**Trace:**
- **Android:** expo-location `LocationResponse.timestamp = Location.getTime()`. This is wall clock: GNSS-derived UTC for the `gps` provider, system time for fused. `mocked = isFromMockProvider`.
- **iOS:** `CLLocation.timestamp`, which is system time.
- **JS:** `normalizeGPSPosition` → `observedAt`. `evaluatedAt = Date.now()` at callback time.
- **No monotonic clock:** expo-location does not expose `elapsedRealtimeNanos`. A monotonic age check would need a native change.

**Effective display gate today** (`useForegroundLocationLifecycle.ts`; the `gps-quality.ts` policy is unset, so `POLICY_NOT_APPROVED`):
- Future skew tolerance is **0 ms**.
- Maximum age is 30 000 ms, inclusive.
- Missing accuracy is rejected; any numeric accuracy is accepted for display.
- LAST_KNOWN is never promoted to READY.
- After 30 s without a fix the state becomes STALE.
- **`mocked` is not checked anywhere.**

Eight boundary characterization tests now pin this behaviour (`tests/gps-timestamp-gate-boundaries.test.ts`).

**Risk.** A device whose system clock runs behind GNSS UTC gets every `gps`-provider fix rejected as "future". There is no device evidence yet. The diagnostic script now prints the device vs host clock delta (case D).

**Proposal — awaiting approval, NOT implemented:**
1. Add a `maxFutureSkewMs` display tolerance of **2 000 ms**. Basis: it covers NTP-level drift and JS callback scheduling without materially extending trust. Fixes beyond it stay INVALID as a clock error. Stale (30 s), accuracy and LAST_KNOWN rules stay unchanged.
2. Before approving, collect coordinate-free `ageMs` from the existing dev trace on 2–3 real devices to confirm the skew distribution.
3. Make a separate product decision on mock locations (reject, flag, or allow in dev builds only). Today mocked fixes reach READY. This is recorded as a GAP test, not changed.

## 4. foreground-location.ts — REMOVED (dead code)

**Evidence it was dead:**
- No static import, dynamic `import()` or `require` in app/src/tests.
- Not an expo-router route.
- History: superseded in `34cb7e4` (home) and `1e08c92` (journey) by the lifecycle hook.
- The Android Hermes bundle contains 0 occurrences of `requestForegroundLocation`.

**Why removal is safe:** it promoted a 60 s cached fix directly to READY, contradicting the watcher contract. Removing it is zero-impact: typecheck, tests and both exports pass.

**Regression test:** the file must not reappear, and only the lifecycle hook may call the native position APIs, routing LAST_KNOWN through the contract.

## 5. GPS emulator script — REVIEWED + HARDENED, emulator still BLOCKED

**Verified by test** (`tests/gps-emulator-script-safety.test.ts`):
- No wipe, `pm clear`, uninstall, `settings put`, `appops set` or grant/revoke in any executable line.
- `geo fix` is called with longitude first, then latitude.
- No conclusion is drawn from "reports = 0".
- Fused and gps providers are explicitly distinguished.

**Fixes:**
- Every adb call now targets one serial (`adb -s`). Previously it failed when more than one device was attached.
- Coordinates are formatted culture-invariant. On a Vietnamese locale Windows, PowerShell would otherwise emit `105,8542`.
- Added a device/host clock delta check.
- The script reports which provider Reality's own request is attached to.
- Output is written to a transcript file.

**Run on Windows:** `powershell -ExecutionPolicy Bypass -File scripts\gps-emulator-diagnose.ps1`, then share the generated `gps-diagnosis-*.txt`.

## 6. Quality gates (local)

| Gate | Result |
|---|---|
| Lint | Repo has no ESLint config. Ran ESLint 9 + typescript-eslint recommended ad hoc. **All 11 TS files changed in CP01+CP02: 0 problems.** Whole repo: 16 errors in 1 pre-existing file (`tests/gps-expo-hook-races.test.ts`, `no-explicit-any` in mocks). |
| Typecheck (core + api + mobile) | PASS |
| Unit + integration tests | PASS **249/249** (40 files). CP01 regressions included (`p0-audit-checkpoint-1.test.ts` 19 tests); CP02 adds 48 tests |
| Build: `expo export` Android | PASS (Hermes 2.9 MB) |
| Build: `expo export` iOS | PASS (Hermes 2.9 MB) — first time run |
| API runtime smoke | PASS (rate-limit modes, fail-closed config) |
| E2E on device | NOT RUN — no device |
| Visual | NOT POSSIBLE — no master |

## 7. Product Completion Matrix (updated)

| Module | Implementation | Functional QA | Visual QA | Production | Blocker |
|---|---|---|---|---|---|
| Reality | IMPLEMENTED / UNVERIFIED | Unit only | VISUAL BLOCKED — MASTER EVIDENCE MISSING | NOT STARTED | Evidence feed; State Matrix V2 doc |
| Context | IN PROGRESS (gate characterized, dead path removed) | Unit + hook tests | BLOCKED | NOT STARTED | Emulator evidence; skew/mock policy approval |
| Decide (Flow 06) | IN PROGRESS | Unit + mocked integration | BLOCKED | NOT STARTED | Flow 06 contract absent |
| Journey | IN PROGRESS | Unit; real routing manual only | BLOCKED | NOT STARTED | G01 master not accessible; TomTom key |
| Stories | NOT STARTED | — | — | — | No contract |
| Contribution | IN PROGRESS (contract only) | Unit only | BLOCKED | NOT STARTED | No submit API/UX contract |
| Authentication | NOT STARTED | — | — | — | Product decision |
| Data / API | IMPLEMENTED / UNVERIFIED (rate-limit P0 fixed) | Unit + local smoke | n/a | NOT READY | No deployment; shared limiter store; feed |
| Native Mobile | IMPLEMENTED / UNVERIFIED (Android + iOS export PASS) | Not run on device | BLOCKED | NOT STARTED | Emulator/device |

## 8. Files changed

- `apps/api/src/client-identity.ts` (new)
- `apps/api/src/api-guard.ts`
- `apps/api/src/server.ts`
- `apps/api/EVIDENCE_FEED.md`
- `apps/mobile/src/infrastructure/location/foreground-location.ts` (deleted)
- `scripts/gps-emulator-diagnose.ps1`
- `tests/rate-limit-client-identity.test.ts`
- `tests/gps-timestamp-gate-boundaries.test.ts`
- `tests/foreground-location-dead-code.test.ts`
- `tests/gps-emulator-script-safety.test.ts`
- `docs/audit/CHECKPOINT-02.md`

## 9. Risk assessment

| Risk | Severity | Status |
|---|---|---|
| Enabling `TRUST_PROXY=railway` while a TCP proxy or other ingress exists allows X-Real-IP spoofing | High if misconfigured | Mitigated by default `none`, `TRUSTED_PROXY_CIDRS` pinning and docs. Needs a deploy-time checklist |
| Per-replica limiter multiplies the limit by the number of replicas | Medium | Documented. Needs a shared store before scale-out |
| 0 ms future-skew rejects valid `gps` fixes on clock-skewed devices | Medium (unproven) | Proposal §3, needs device data |
| Mock locations accepted as live | Medium (product) | GAP test, needs a decision |
| Contracts exist only as user-held artifacts; code may drift | High for Visual/Decide | BLOCKED until docs are added to the repo |
| No committed lint config | Low | Ad-hoc lint clean on changed code. Add a config in a later checkpoint |

## 10. Next actionable checkpoint (CP03)

1. **User:** commit Full State Matrix V2, the Flow 06 contract, the Journey G01 Visual Master V1 and the Product V2 master into `docs/contracts/` and `docs/masters/`. This unblocks Visual QA and Decide.
2. **User:** run the GPS script on Windows and share the transcript. Approve or reject the 2 000 ms skew tolerance and the mock-location policy.
3. **Engineering (no approval needed):** commit an ESLint config and clean `gps-expo-hook-races.test.ts`. Add a `RateLimitStore` interface so a Redis-backed store can be plugged in without changing the guard.
4. **Engineering after approval:** implement the skew/mock policy with boundary tests. Write a Stories and Contribution submit-API contract proposal for approval.
5. **Push and PR:** only when you authorize it. One batched push, CI on PR only.
