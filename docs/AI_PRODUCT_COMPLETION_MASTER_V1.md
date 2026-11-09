# AI Product Completion Master V1 — App Map

Owner-approved common completion policy, 2026-11-09. Supplements existing approved project operating rules, scope and locked visuals. Existing stricter rules always prevail. Do not assume this documentation-only change authorizes product implementation or deployment.

## Six gates
1. AUDIT: inspect repository, current SHA, branches, Draft PRs, approved requirements, visual locks, data and QA. Resolve product identity and conflicts before execution.
2. MAP: document full user journeys across Web, native app, API, admin, auth, persistence, payments if applicable, error/loading/empty and permission states.
3. IMPLEMENT: work through dependencies and root causes within approved work-order scope; preserve code, locked designs and user data.
4. VERIFY: unit, integration, regression and real E2E; desktop 1536/mobile 390 and physical device where applicable. Fix and retest safely; do not fabricate PASS.
5. ACCEPT: capture exact SHA, environment, reproducible evidence and PASS/FAIL/PARTIAL/BLOCKED/NOT TESTED for each journey.
6. RELEASE: distinguish QA from production readiness; review security, migration/backup/rollback, monitoring and approvals.

## Project-specific audit focus (UNVERIFIED)
Road/parking state, uncertainty, freshness, offline, permissions and safe user actions.

## Hard stops
No merge, production deploy, Store submission, paid CI, new billable resources, destructive migration, credentials changes or changes to locked scope without separate explicit owner approval. Draft PRs stay Draft. Never claim historical test counts prove completion. Report only true blockers and owner decisions.

Maintain `docs/governance/PRODUCT_COMPLETION_LEDGER.md` as the evidence-backed acceptance ledger. Product Completion > Task Completion.
