import { z } from "zod";
import type { Router } from "./http/router";
import * as C from "./http/contracts";
import { consentSchema, deleteSchema, preferencesSchema, profileSchema, savedPlaceSchema } from "./modules/account";
import { reportSchema, voteSchema } from "./modules/contribution";
import { decideSchema } from "./modules/decision";
import { federatedSchema, loginSchema, passwordChangeSchema, refreshSchema, registerSchema } from "./modules/identity";
import { createSchema as journeyCreateSchema, eventSchema as journeyEventSchema } from "./modules/journeys";
import { listSchema as placeListSchema } from "./modules/places";
import { storySchema } from "./modules/stories";
import { watchSchema } from "./modules/watch-pulse";

type Doc = { summary: string; tag: string; body?: z.ZodType; query?: z.ZodType; response?: z.ZodType; status?: number };

/** Route documentation keyed by "METHOD pattern". Undocumented routes still appear (generic JSON) and are flagged by tests. */
export const ROUTE_DOCS: Record<string, Doc> = {
  "GET /health/live": { tag: "Ops", summary: "Process liveness" },
  "GET /health/ready": { tag: "Ops", summary: "Readiness: database, PostGIS, migrations, optional providers" },
  "POST /v1/auth/register": { tag: "Identity", summary: "Create an account (email + password)", body: registerSchema, response: C.AuthResponse, status: 201 },
  "POST /v1/auth/login": { tag: "Identity", summary: "Sign in", body: loginSchema, response: C.AuthResponse },
  "POST /v1/auth/refresh": { tag: "Identity", summary: "Rotate tokens (single-use refresh; reuse revokes the family)", body: refreshSchema, response: z.object({ tokens: C.TokenPair }) },
  "POST /v1/auth/federated": { tag: "Identity", summary: "Sign in with a Google/Apple ID token (feature-flagged)", body: federatedSchema, response: C.AuthResponse },
  "POST /v1/auth/logout": { tag: "Identity", summary: "Revoke the current session family", status: 204 },
  "POST /v1/auth/logout-all": { tag: "Identity", summary: "Revoke every session", status: 204 },
  "POST /v1/auth/password": { tag: "Identity", summary: "Change password (revokes other sessions)", body: passwordChangeSchema, status: 204 },
  "GET /v1/auth/sessions": { tag: "Identity", summary: "Active sessions" },
  "GET /v1/me": { tag: "Account", summary: "Profile and current consents" },
  "PATCH /v1/me": { tag: "Account", summary: "Update profile", body: profileSchema },
  "GET /v1/me/preferences": { tag: "Account", summary: "Personalization preferences" },
  "PUT /v1/me/preferences": { tag: "Account", summary: "Update preferences", body: preferencesSchema },
  "GET /v1/me/consents": { tag: "Privacy", summary: "Current consent per purpose" },
  "POST /v1/me/consents": { tag: "Privacy", summary: "Grant or revoke a purpose (append-only ledger)", body: consentSchema },
  "GET /v1/me/saved-places": { tag: "Account", summary: "Saved places" },
  "POST /v1/me/saved-places": { tag: "Account", summary: "Save a place", body: savedPlaceSchema, status: 204 },
  "DELETE /v1/me/saved-places/:placeId": { tag: "Account", summary: "Unsave a place", status: 204 },
  "GET /v1/me/export": { tag: "Privacy", summary: "Export all personal data (JSON)" },
  "POST /v1/me/delete": { tag: "Privacy", summary: "Delete the account (erasure)", body: deleteSchema, status: 204 },
  "GET /v1/places/search": { tag: "Places", summary: "Geocoding pass-through (TomTom; not persisted)" },
  "GET /v1/places": { tag: "Places", summary: "List/search places (q, category, near+radius, bbox)", query: placeListSchema, response: C.PlaceList },
  "GET /v1/places/categories": { tag: "Places", summary: "Category catalog with counts" },
  "GET /v1/places/:idOrSlug": { tag: "Places", summary: "Place detail with evaluated states, stories and recent reports", response: C.PlaceDetail },
  "GET /v1/reality/states": { tag: "Reality", summary: "Point-domain states (road, weather, activity) in a bbox", response: C.StatesResponse },
  "GET /v1/reality/pulse": { tag: "Reality", summary: "World Pulse: meaningful recent changes", response: C.PulseResponse },
  "GET /v1/reality/pulses": { tag: "Reality", summary: "Legacy P0 envelope of World Pulse (mobile)" },
  "POST /v1/reports": { tag: "Contribution", summary: "Submit an observation (opt-in)", body: reportSchema, response: C.SubmitReportResponse, status: 201 },
  "POST /v1/reports/:id/votes": { tag: "Contribution", summary: "Confirm/deny a nearby report", body: voteSchema },
  "DELETE /v1/reports/:id": { tag: "Contribution", summary: "Withdraw own report", status: 204 },
  "GET /v1/me/reports": { tag: "Contribution", summary: "Own reports" },
  "GET /v1/reports": { tag: "Contribution", summary: "Public active reports in a bbox (approximate cells only)" },
  "POST /v1/routing/route": { tag: "Journey", summary: "Route through the gateway (success never implies permission to start)" },
  "POST /v1/decide": { tag: "Decide", summary: "Flow 06 — Đi đâu bây giờ? Grounded, explained options", body: decideSchema, response: C.DecideResponse },
  "POST /v1/journeys": { tag: "Journey", summary: "Plan a journey", body: journeyCreateSchema, status: 201 },
  "GET /v1/journeys": { tag: "Journey", summary: "Journey history" },
  "GET /v1/journeys/:id": { tag: "Journey", summary: "Journey with impact and events" },
  "GET /v1/journeys/:id/impact": { tag: "Journey", summary: "Verified conditions affecting the route" },
  "POST /v1/journeys/:id/events": { tag: "Journey", summary: "Lifecycle events (START/PAUSE/RESUME/ARRIVE/CANCEL/STOP/POSITION)", body: journeyEventSchema },
  "POST /v1/journeys/:id/reroute": { tag: "Journey", summary: "Reroute from a new origin" },
  "POST /v1/journeys/:id/shares": { tag: "Sharing", summary: "Time-limited ETA share link (consent + flag)", status: 201 },
  "DELETE /v1/journeys/:id/shares/:shareId": { tag: "Sharing", summary: "Revoke a share", status: 204 },
  "GET /v1/shared-journeys/:token": { tag: "Sharing", summary: "Public ETA-only view of a shared journey" },
  "GET /v1/me/watch-areas": { tag: "Watch", summary: "Watch areas" },
  "POST /v1/me/watch-areas": { tag: "Watch", summary: "Create a watch area (circle, place or route)", body: watchSchema, status: 201 },
  "PATCH /v1/me/watch-areas/:id": { tag: "Watch", summary: "Update a watch area" },
  "DELETE /v1/me/watch-areas/:id": { tag: "Watch", summary: "Delete a watch area", status: 204 },
  "GET /v1/me/notifications": { tag: "Watch", summary: "Notifications", response: C.NotificationList },
  "POST /v1/me/notifications/read": { tag: "Watch", summary: "Mark notifications read", status: 204 },
  "POST /v1/me/push-tokens": { tag: "Watch", summary: "Register an Expo push token (notification consent required)", status: 204 },
  "GET /v1/stories": { tag: "Stories", summary: "Published stories" },
  "GET /v1/stories/:slug": { tag: "Stories", summary: "Story detail" },
  "GET /v1/me/stories": { tag: "Stories", summary: "Own stories" },
  "POST /v1/stories": { tag: "Stories", summary: "Create a draft", body: storySchema, status: 201 },
  "PUT /v1/stories/:id": { tag: "Stories", summary: "Edit a draft", body: storySchema, status: 204 },
  "POST /v1/stories/:id/submit": { tag: "Stories", summary: "Submit for review (sources required)", status: 204 },
  "GET /v1/seo/sitemap": { tag: "SEO", summary: "Indexable entities for the sitemap" },
  "GET /v1/seo/places/:slug": { tag: "SEO", summary: "Indexability of a place page" },
  "GET /v1/sources": { tag: "SEO", summary: "Public catalog of data sources, licences and limitations" },
  "GET /v1/areas": { tag: "SEO", summary: "Coverage areas" },
  "GET /v1/areas/:id": { tag: "SEO", summary: "Area discovery data" },
  "GET /v1/areas/:id/categories/:category": { tag: "SEO", summary: "Category inside an area" },
  "GET /v1/openapi.json": { tag: "Ops", summary: "This document" },
};

function toJson(schema: z.ZodType, io: "input" | "output") {
  return z.toJSONSchema(schema, { io, unrepresentable: "any", target: "draft-2020-12" }) as Record<string, unknown>;
}

export function buildOpenApi(router: Router, version = "0.2.0") {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of router.list()) {
    const key = `${r.method} ${r.pattern}`;
    const doc = ROUTE_DOCS[key];
    const path = r.pattern.replace(/:([A-Za-z]+)/g, "{$1}");
    const params = [...r.pattern.matchAll(/:([A-Za-z]+)/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    const tag = doc?.tag ?? (r.pattern.startsWith("/v1/admin") ? "Admin" : "Other");
    const op: Record<string, unknown> = {
      operationId: key.replace(/[^A-Za-z0-9]+/g, "_"),
      summary: doc?.summary ?? (tag === "Admin" ? "Admin & operations (moderator/admin role, audited)" : key),
      tags: [tag],
      ...(params.length ? { parameters: params } : {}),
      ...(r.auth !== "none" ? { security: r.auth === "optional" ? [{}, { bearer: [] }] : [{ bearer: [] }], "x-required-role": r.auth } : {}),
      responses: {
        [String(doc?.status ?? 200)]: doc?.status === 204 ? { description: "No content" } : { description: "OK", content: { "application/json": { schema: doc?.response ? toJson(doc.response, "output") : { type: "object" } } } },
        "4XX": { description: "Client error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        "429": { description: "Rate limited (Retry-After header)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    };
    if (doc?.body) op.requestBody = { required: true, content: { "application/json": { schema: toJson(doc.body, "input") } } };
    if (doc?.query) {
      const qs = toJson(doc.query, "input") as { properties?: Record<string, unknown>; required?: string[] };
      op.parameters = [...params, ...Object.entries(qs.properties ?? {}).map(([name, schema]) => ({ name, in: "query", required: (qs.required ?? []).includes(name), schema }))];
    }
    (paths[path] ??= {})[r.method.toLowerCase()] = op;
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "REALITY API", version,
      description: "Real-World State Network. Versioned under /v1 (breaking changes go to /v2). Errors use { error, details?, requestId }. " +
        "Every state carries truth (KNOWN/UNKNOWN/CONFLICT), freshness, confidence, nature and sources. UNKNOWN never means safe.",
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Opaque access token (rat_…), 15 min" } },
      schemas: { Error: toJson(C.ErrorEnvelope, "output") },
    },
    paths,
  };
}
