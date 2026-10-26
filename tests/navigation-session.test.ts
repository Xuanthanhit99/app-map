import { describe, expect, it } from "vitest";
import type { ValidatedNavigationRoute } from "../src/routing/navigation-session";
import { createNavigationSession, reduceNavigationSession } from "../src/routing/navigation-session";

const route = (id: string): ValidatedNavigationRoute => ({
  geometry: { id, source: "ROUTING_ENGINE", generatedAt: 1, coordinates: [[105.85, 21.02], [105.86, 21.03]] },
  distanceMeters: 1200,
  maneuvers: [{ sequence: 0, maneuver: "DEPART", instructionType: "LOCATION_DEPARTURE", routeOffsetInMeters: 0,
    point: [105.85, 21.02], pointIndex: 0, message: "Depart" }],
  dataValid: true, guidanceReady: true,
});
const ready = () => createNavigationSession("session-1", route("old"));
const active = () => reduceNavigationSession(ready(), { type: "START", sessionId: "session-1", startGatePassed: true, at: 100 });
const request = (s: ReturnType<typeof ready>, id = "req-1") => reduceNavigationSession(s, {
  type: "REQUEST_REROUTE", sessionId: "session-1", requestId: id, baseRevision: s.routeRevision,
});
const success = (id = "req-1", candidate: unknown = route("new")) => ({
  type: "REROUTE_SUCCEEDED" as const, sessionId: "session-1", requestId: id, baseRevision: 1, candidate,
});

describe("E-03 navigation session reducer", () => {
  it("creates unique session identity supplied by caller with revision 1", () => {
    expect(ready()).toMatchObject({ sessionId: "session-1", status: "READY", routeRevision: 1 });
  });
  it("rejects invalid initial routes", () => {
    expect(() => createNavigationSession("s", { dataValid: false })).toThrow("INVALID_SESSION_INITIAL_ROUTE");
  });
  it("does not start without an external Start Gate", () => {
    expect(reduceNavigationSession(ready(), { type: "START", sessionId: "session-1", startGatePassed: false, at: 1 })).toBeDefined();
    expect(reduceNavigationSession(ready(), { type: "START", sessionId: "session-1", startGatePassed: false, at: 1 }).status).toBe("READY");
  });
  it("starts only once after explicit external gate", () => {
    expect(active()).toMatchObject({ status: "ACTIVE", startedAt: 100 });
    const s = active();
    expect(reduceNavigationSession(s, { type: "START", sessionId: "session-1", startGatePassed: true, at: 200 })).toBe(s);
  });
  it("rejects cross-session events", () => {
    const s = active();
    expect(reduceNavigationSession(s, { type: "STOP", sessionId: "other", at: 200 })).toBe(s);
  });
  it("issues reroute with request ID and base revision", () => {
    expect(request(active())).toMatchObject({ status: "REROUTING", pendingReroute: { requestId: "req-1", baseRevision: 1 } });
  });
  it("ignores competing request while one is pending", () => {
    const s = request(active());
    expect(reduceNavigationSession(s, { type: "REQUEST_REROUTE", sessionId: "session-1", requestId: "req-2", baseRevision: 1 })).toBe(s);
  });
  it("ignores stale request IDs and revisions", () => {
    const s = request(active());
    expect(reduceNavigationSession(s, success("req-old"))).toBe(s);
    expect(reduceNavigationSession(s, { ...success(), baseRevision: 0 })).toBe(s);
  });
  it("atomically replaces route and increments revision once", () => {
    const s = request(active());
    const next = reduceNavigationSession(s, success());
    expect(next).toMatchObject({ routeRevision: 2, status: "ACTIVE", route: { geometry: { id: "new" } } });
    expect(next.pendingReroute).toBeUndefined();
    expect(reduceNavigationSession(next, success())).toBe(next);
  });
  it("rejects unvalidated candidate and preserves old route", () => {
    const s = request(active());
    expect(reduceNavigationSession(s, success("req-1", { ...route("bad"), guidanceReady: false }))).toBe(s);
    expect(s.route.geometry.id).toBe("old");
  });
  it("keeps old route when reroute fails", () => {
    const s = request(active());
    const next = reduceNavigationSession(s, { type: "REROUTE_FAILED", sessionId: "session-1", requestId: "req-1", baseRevision: 1 });
    expect(next).toMatchObject({ status: "ACTIVE", routeRevision: 1, route: { geometry: { id: "old" } } });
  });
  it("ignores failure from stale request", () => {
    const s = request(active());
    expect(reduceNavigationSession(s, { type: "REROUTE_FAILED", sessionId: "session-1", requestId: "old", baseRevision: 1 })).toBe(s);
  });
  it("preserves degraded GPS state across successful reroute", () => {
    const s = request(active());
    const degraded = reduceNavigationSession(s, { type: "GPS_DEGRADED", sessionId: "session-1" });
    expect(reduceNavigationSession(degraded, success()).status).toBe("GPS_DEGRADED");
  });
  it("pause invalidates in-flight reroute", () => {
    const paused = reduceNavigationSession(request(active()), { type: "PAUSE", sessionId: "session-1" });
    expect(paused.pendingReroute).toBeUndefined();
    expect(reduceNavigationSession(paused, success())).toBe(paused);
  });
  it("does not resume without an external gate", () => {
    const paused = reduceNavigationSession(active(), { type: "PAUSE", sessionId: "session-1" });
    expect(reduceNavigationSession(paused, { type: "RESUME", sessionId: "session-1" })).toBe(paused);
  });
  it.each(["STOP", "ARRIVE", "FAIL"] as const)("%s invalidates pending reroute permanently", type => {
    const ended = reduceNavigationSession(request(active()), { type, sessionId: "session-1", at: 200 });
    expect(ended.pendingReroute).toBeUndefined();
    expect(ended.endedAt).toBe(200);
    expect(reduceNavigationSession(ended, success())).toBe(ended);
  });
  it("rejects reroute on READY session", () => {
    const s = ready();
    expect(request(s)).toBe(s);
  });
});
