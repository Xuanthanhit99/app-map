import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as C from "../apps/api/src/http/contracts";
import { ROUTE_DOCS } from "../apps/api/src/openapi";
import type { RoutingProvider } from "../src/routing/routing-contract";
import { hasTestDatabase, insertTestPlace, registerUser, startHarness, type Harness } from "./helpers/api-harness";

const routing: RoutingProvider = { id: "test", async route(r) {
  return { status: "SUCCESS", provider: "test", distanceMeters: 1000, durationSeconds: 300, route: { id: "x", source: "ROUTING_ENGINE", generatedAt: Date.now(), coordinates: [r.origin, r.destination] } };
} };

describe.skipIf(!hasTestDatabase)("API contract: live responses match the published OpenAPI contracts", () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness({ overrides: { routing } }); });
  afterAll(async () => { await h?.close(); });

  it("every public and user route is documented; admin routes are role-tagged", async () => {
    const doc = await h.request("GET", "/v1/openapi.json");
    expect(doc.status).toBe(200);
    expect(doc.body.openapi).toBe("3.1.0");
    const ops = Object.entries(doc.body.paths as Record<string, Record<string, { tags: string[]; "x-required-role"?: string }>>)
      .flatMap(([path, methods]) => Object.entries(methods).map(([m, op]) => ({ key: `${m.toUpperCase()} ${path}`, op })));
    const undocumented = ops.filter((o) => !o.key.includes("/v1/admin") && !ROUTE_DOCS[o.key.replace(/\{([A-Za-z]+)\}/g, ":$1")]).map((o) => o.key);
    expect(undocumented).toEqual([]);
    for (const o of ops.filter((x) => x.key.includes("/v1/admin"))) expect(["moderator", "admin"]).toContain(o.op["x-required-role"]);
  });

  it("errors use the uniform envelope", async () => {
    for (const r of [await h.request("GET", "/v1/me"), await h.request("GET", "/nope"), await h.request("POST", "/v1/auth/login", { body: {} })]) {
      expect(() => C.ErrorEnvelope.parse(r.body)).not.toThrow();
    }
  });

  it("core flows conform to response contracts", async () => {
    const reg = await h.request("POST", "/v1/auth/register", { body: { email: "contract@example.test", password: "a long enough secret", displayName: "Hợp đồng" } });
    C.AuthResponse.parse(reg.body);
    const token = reg.body.tokens.accessToken;
    await h.request("POST", "/v1/me/consents", { token, body: { purpose: "contribution_public", granted: true } });
    const p = await insertTestPlace(h, { name: "Thư viện Quốc gia", category: "library", lat: 21.0258, lng: 105.8466, openingHours: "Mo-Fr 08:00-17:00" });
    C.PlaceList.parse((await h.request("GET", "/v1/places?near=21.0258,105.8466&radius=1000")).body);
    C.PlaceDetail.parse((await h.request("GET", `/v1/places/${p.slug}`)).body);
    const rep = await h.request("POST", "/v1/reports", { token, body: { domain: "ROAD", value: "SLOW", latitude: 21.026, longitude: 105.847 } });
    C.SubmitReportResponse.parse(rep.body);
    C.StatesResponse.parse((await h.request("GET", "/v1/reality/states?bbox=105.84,21.02,105.85,21.03")).body);
    C.PulseResponse.parse((await h.request("GET", "/v1/reality/pulse?bbox=105.84,21.02,105.85,21.03")).body);
    C.DecideResponse.parse((await h.request("POST", "/v1/decide", { body: { intent: "đọc sách yên tĩnh", origin: { latitude: 21.026, longitude: 105.847 }, useLocation: true } })).body);
    C.DecideResponse.parse((await h.request("POST", "/v1/decide", { body: { intent: "???", origin: { latitude: 21.026, longitude: 105.847 }, useLocation: true } })).body);
    const j = await h.request("POST", "/v1/journeys", { token, body: { origin: { latitude: 21.03, longitude: 105.85 }, destinationPlaceId: p.id } });
    C.Journey.parse(j.body.journey);
    C.NotificationList.parse((await h.request("GET", "/v1/me/notifications", { token })).body);
  });
});
