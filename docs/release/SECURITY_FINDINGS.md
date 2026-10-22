# Security Findings — dependency audit

Reviewed 2026-10-22 on `feat/reality-v2-completion`. Source: `npm audit --json` (full tree, dev + prod). The gate result is in `docs/release/evidence/security/audit-gate.json`.

## Gate (enforced)

`scripts/security-gate.mjs` is a **blocking** CI step. It replaces the earlier `npm audit … || echo` step, which never failed. The gate fails when:
- any **critical** advisory is present (critical advisories cannot be excepted);
- any moderate or high advisory is not listed in `security/audit-exceptions.json`;
- an exception has expired (all current exceptions expire 2027-01-20) or is missing evidence or remediation fields;
- a package excepted as `build-tool` or `dev-tool` appears in the Android or iOS bundle source maps. The CI exports both bundles with `--source-maps`, so the "not shipped" claim is checked, not assumed.

The gate's own behaviour is tested in `tests/security-gate.test.ts` (5 cases: pass, unexcepted, critical, misclassified-shipped, stale).

## Before → after

| | Critical | High | Moderate | Total |
|---|---|---|---|---|
| Start of pass (full tree) | 2 | 24 | 14 | 40 |
| After fixes | **0** | 23 | 8 | 31 |

The remaining counts include parent packages flagged only because they depend on a vulnerable package (for example `expo`, `metro`, `react-native`). Only **6 advisories in 5 packages** remain, and each has a documented exception.

## Fixed

| Package | Advisories | Exposure | Fix |
|---|---|---|---|
| vitest, @vitest/mocker, vite, vite-node, esbuild, tinypool | GHSA-5xrq-8626-4rwp (critical), GHSA-5gmw-xhrv-c9v3 / GHSA-85c8-ppgw-ccpr (critical, tinypool), GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp, multiple vite / esbuild dev-server issues | Test runner on developer and CI machines (CI holds secrets) | vitest 2.1.9 → **4.1.12**, which pulls vite 8.3.5 and drops tinypool. Suite unchanged: 49 files / 329 tests pass |
| postcss (under @expo/metro-config) | GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849 (high), GHSA-qx2v-qp2m-jg93, GHSA-fxqj-rqcc-2cmp | Build machine (Metro CSS transform) | Override `postcss@<8.5.23 → 8.5.31` (same major). Web's Next.js postcss 8.5.23 was not affected |
| uuid (under xcode) | GHSA-w5hq-g745-h8pq | Build machine (iOS prebuild); xcode only calls `uuid.v4()` | Override `uuid → 11.1.1` (CommonJS `v4` API unchanged, verified) |
| maplibre-gl | GHSA-jrc7-96c5-q579 (critical XSS) | **Shipped to browsers** | 5.24.0 → 6.13.0 (previous commit `bdb769b`) |

## Excepted (documented, expires 2027-01-20)

| Package | Advisory | Sev. | Scope | Why it is not a release blocker | Evidence |
|---|---|---|---|---|---|
| braces 3.0.3 | GHSA-vfj7-8cjw-p6xm | high | build-tool | DoS through nested glob patterns. The patterns come only from repository Metro config | No patched release exists; absent from bundles (gate-checked) |
| image-size 1.2.1 | GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr | high | build-tool | DoS on crafted JXL / HEIF / ICNS files. Metro parses only repository assets | Fix only in 2.x, whose API is incompatible with metro 0.83 `imageSize(path)`; absent from bundles |
| node-forge 1.4.0 | GHSA-86w9-cpqp-85rv | high | build-tool | Signature-verification flaw used only for expo-updates code signing. expo-updates is not installed and no signing certificate is configured | No patched release exists; `app.json` checked; absent from bundles |
| sprintf-js 1.0.3 | GHSA-hp3w-g68c-fv3c | moderate | dev-tool | Reached only through Jest coverage tooling, which this repository does not run (tests use vitest) | No patched release exists; absent from bundles |
| decode-uri-component 0.2.2 | GHSA-vcc3-ghjq-m6fr | moderate | runtime-unreachable | **Ships in the mobile bundle**, but is reached only via `query-string.parse`. expo-router 6.0.24 calls only `stringify` (its `parse` call is commented out), and no other bundled module imports query-string | Upgrading to query-string 9 would break expo-router at runtime (ESM default-only export vs `__importStar(require()).stringify`) |

All five exceptions disappear with an Expo SDK major upgrade: the `npm audit fix` target is expo 58 / react-native 0.88 / expo-router 58. That upgrade is four SDK majors away. It is tracked as remediation, not forced into this pass.

## Other runtime surfaces

- **Web:** no advisories in the Next.js / React / MapLibre production tree after the MapLibre upgrade.
- **API:** no advisories (pg, zod, @asteasolutions/zod-to-openapi).
- **Expo dev server** (`expo start`, development only): it listens on the LAN. Do not run it on untrusted networks. This does not apply to release builds.
