# Security Findings — dependency audit

Re-reviewed 2026-10-26 (14:11 Asia/Bangkok) on `feat/reality-v2-completion`, continuing the 2026-10-22 review. Source: `npm audit --json` on the workspace lockfile and on `e2e/package-lock.json`. The gate result is in `docs/release/evidence/security/audit-gate.json`.

## Gate (enforced)

`scripts/security-gate.mjs` is a **blocking** CI step. It replaces the earlier `npm audit … || echo` step, which never failed. Live mode audits both lockfiles. The gate fails when:
- any **critical** advisory is present (critical advisories cannot be excepted);
- any moderate or high advisory is not listed in `security/audit-exceptions.json`;
- an exception has expired (all current exceptions expire 2027-01-20) or is missing evidence or remediation fields;
- a package excepted as `build-tool` or `dev-tool` appears in the Android or iOS bundle source maps. The CI exports both bundles with `--source-maps`, so the "not shipped" claim is checked, not assumed.

The gate's own behaviour is tested in `tests/security-gate.test.ts` (5 cases: pass, unexcepted, critical, misclassified-shipped, stale).

## This re-review

`npm audit` metadata counts packages in the tree, including parents that are flagged only because they depend on a vulnerable package. The gate decides on advisories.

| Tree | When | Critical | High (metadata) | Moderate (metadata) | Advisories that need a decision |
|---|---|---|---|---|---|
| workspace | 2026-10-26 before the nodemailer bump | 0 | 6 | 4 | 7: image-size ×2, node-forge, decode-uri-component, nodemailer ×3 |
| workspace | after the bump | 0 | 6 | 3 | 4, all excepted (image-size ×2, node-forge, decode-uri-component) |
| e2e | before the override | not separately gated; lockfile pinned nodemailer 10.0.14 | | | the same three nodemailer advisories, via mailparser and smtp-server |
| e2e | after `overrides.nodemailer = 10.2.1` | 0 | 0 | 0 | none |

## 2026-10-22 baseline (unchanged history)

| | Critical | High | Moderate | Total (metadata) |
|---|---|---|---|---|
| Start of the 2026-10-22 pass | 2 | 24 | 14 | 40 |
| After that pass | 0 | 23 | 8 | 31 |

Those metadata totals included parent packages. The 2026-10-22 exception list named 6 advisories in 5 packages. Two of those advisories have since been withdrawn, so they are no longer exceptions.

## Fixed

| Package | Advisories | Exposure | Fix |
|---|---|---|---|
| vitest, @vitest/mocker, vite, vite-node, esbuild, tinypool | GHSA-5xrq-8626-4rwp (critical), GHSA-5gmw-xhrv-c9v3 / GHSA-85c8-ppgw-ccpr (critical, tinypool), GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp, multiple vite / esbuild dev-server issues | Test runner on developer and CI machines (CI holds secrets) | vitest 2.1.9 → **4.1.12**, which pulls vite 8.3.5 and drops tinypool. Suite unchanged: 49 files / 329 tests pass |
| postcss (under @expo/metro-config) | GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849 (high), GHSA-qx2v-qp2m-jg93, GHSA-fxqj-rqcc-2cmp | Build machine (Metro CSS transform) | Override `postcss@<8.5.23 → 8.5.31` (same major). Web's Next.js postcss 8.5.23 was not affected |
| uuid (under xcode) | GHSA-w5hq-g745-h8pq | Build machine (iOS prebuild); xcode only calls `uuid.v4()` | Override `uuid → 11.1.1` (CommonJS `v4` API unchanged, verified) |
| maplibre-gl | GHSA-jrc7-96c5-q579 (critical XSS) | **Shipped to browsers** | 5.24.0 → 6.13.0 (commit `bdb769b`) |
| nodemailer | GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w, GHSA-85x2-q946-cp5h (moderate). addressparser mis-read three RFC 5322 forms and could deliver to an attacker-chosen domain | **Shipped in the API image.** `SmtpMailer` passes `to` and `from` through nodemailer. Account mail (verification, reset, change notice) uses this path. The published proofs are rejected by `emailSchema` (zod), so a registration cannot store them today; `MAIL_FROM` and any future header-shaped recipient would still have been parsed. The e2e SMTP sink and mail parser pinned the same vulnerable line | API dependency 10.0.16 → **10.2.1** (same major; `npm audit` reports `isSemVerMajor: false`). e2e override forces 10.2.1 over mailparser's and smtp-server's 10.0.14 pin. `tests/mail-recipient-boundary.test.ts` locks both the schema rejection and the patched parse |

## Withdrawn (removed from the exception list)

| Advisory | Withdrawn | Why it is not kept as an exception |
|---|---|---|
| braces GHSA-vfj7-8cjw-p6xm | 2026-10-23 | GitHub withdrew it as not practically exploitable. `npm audit` no longer reports it. braces 3.0.3 is still in the Metro file crawler and is still not shipped |
| sprintf-js GHSA-hp3w-g68c-fv3c | 2026-10-22 | Withdrawn because the source CVE was rejected. `npm audit` no longer reports it. The package remains only on the unused Jest coverage path |

## Excepted (documented, expires 2027-01-20, re-checked 2026-10-26)

| Package | Advisory | Sev. | Scope | Why it is not a release blocker | Evidence |
|---|---|---|---|---|---|
| image-size 1.2.1 | GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr | high | build-tool | DoS on crafted JXL / HEIF / ICNS files. Metro parses only repository assets | Patched line is 2.0.3+ (latest 2.0.4). `imageSize()` there accepts only `Uint8Array`. metro 0.83.3 `Assets.js` line 173 still passes a filesystem path. Forcing the override would break asset bundling. Absent from bundles (gate-checked in CI) |
| node-forge 1.4.0 | GHSA-86w9-cpqp-85rv | high | build-tool | Signature-verification flaw used by Expo CLI for expo-updates code signing. This app does not install expo-updates and configures no signing certificate, so the vulnerable check is not invoked | `npm view node-forge version` is still 1.4.0. `app.json` and `app.config.ts` set no `codeSigningCertificate`. Absent from bundles (gate-checked in CI) |
| decode-uri-component 0.2.2 | GHSA-vcc3-ghjq-m6fr | moderate | runtime-unreachable | **Ships in the mobile bundle.** In query-string 7.1.3 the vulnerable decoder is reached only through `parse` / `parseUrl` / `extract` | Re-checked expo-router 6.0.24: only `getPathFromState.js:276` and `getPathFromState-forks.js:71` import query-string, and both call `stringify`. The `parse` line in `getStateFromPath.js:538` is still a comment and that file does not import query-string. No other installed package requires query-string. query-string 9 is ESM-only and would make expo-router's `require().stringify` undefined |

The three remaining exceptions disappear with an Expo SDK major upgrade (audit fix targets include expo-router 58). That upgrade is several SDK majors away. It is tracked as remediation, not forced into this pass. Expo and Metro packages are not treated as harmless as a class: each remaining advisory was re-checked against the call site that reaches it.

## Other runtime surfaces

- **Web:** no advisories in the Next.js / React / MapLibre production tree after the MapLibre upgrade.
- **API:** no remaining advisories after nodemailer 10.2.1 (pg, zod, @asteasolutions/zod-to-openapi, nodemailer).
- **Expo dev server** (`expo start`, development only): it listens on the LAN. Do not run it on untrusted networks. This does not apply to release builds.
