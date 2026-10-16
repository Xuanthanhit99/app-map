# Backend P0 feed configuration

The backend does not manufacture live traffic, place or decision evidence.

- `EVIDENCE_FEED_URL`: HTTPS endpoint returning a JSON object `{ "places": [...] }`.
- `EVIDENCE_FEED_TOKEN`: server-side bearer credential. Never expose to web/mobile.
- Both unset: public endpoints remain empty; decision queries return `NO_VERIFIED_DATA` only after explicit context. One unset: startup fails closed.
- Feed records must include `id`, `title`, `latitude`, `longitude`, and `evidence: { truth, source, provenanceId, observedAt }`.
- `truth` is `KNOWN | UNKNOWN | CONFLICT`; source/provenanceId/observedAt are nullable and only fresh `KNOWN` records with complete provenance are eligible for plans.
- A configured feed must be an authorized real-world data source; a successful CI mock does not prove production data access.

## API

- `GET /v1/reality/pulses`: public, empty until verified reality data exists.
- `GET /v1/decision/plans`: public context-free read, no implicit consent.
- `POST /v1/decision/plans/query`: JSON `{ "intent": "explore", "consentToUseContext": true }`. 4 KiB body limit, no GPS inferred.
- `POST /v1/routing/route`: routing success never implies permission to start navigation.
- `GET /health/live`: process liveness only, not provider readiness.

Production blockers: licensed evidence feed, rate limits, cancellation, deployment security, native/device validation and integrated E2E.
