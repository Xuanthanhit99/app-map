import { describe, expect, it } from "vitest";
import { reduceLocation, type LocationLifecycle } from "../src/location/location-lifecycle";
import { isRenderableRoute, selectMapItem } from "../src/map/map-contract";

describe("location lifecycle", () => {
  it("degrades a valid fix without discarding last known position", () => {
    const ready: LocationLifecycle = { status: "READY", latitude: 21.02, longitude: 105.83, accuracyMeters: 20, observedAt: 100 };
    expect(reduceLocation(ready, { type: "DEGRADE", reason: "STALE" })).toEqual({
      status: "DEGRADED", lastKnown: { latitude: 21.02, longitude: 105.83, observedAt: 100 }, reason: "STALE",
    });
  });

  it("recovers from degraded when a fresh fix arrives", () => {
    const degraded: LocationLifecycle = { status: "DEGRADED", lastKnown: { latitude: 21.02, longitude: 105.83, observedAt: 100 }, reason: "TEMPORARILY_UNAVAILABLE" };
    expect(reduceLocation(degraded, { type: "FIX", latitude: 21.03, longitude: 105.84, accuracyMeters: 12, observedAt: 200 })).toMatchObject({ status: "READY", latitude: 21.03, longitude: 105.84, observedAt: 200 });
  });

  it("keeps denied distinct from unavailable", () => {
    expect(reduceLocation({ status: "IDLE" }, { type: "DENY", canAskAgain: false }).status).toBe("DENIED");
    expect(reduceLocation({ status: "IDLE" }, { type: "UNAVAILABLE", reason: "NO_FIX" }).status).toBe("UNAVAILABLE");
  });
});

describe("map contracts", () => {
  it("validates route geometry without provider knowledge", () => {
    expect(isRenderableRoute({ id: "r1", coordinates: [[105.8, 21.0], [105.9, 21.1]], source: "MOCK", generatedAt: 1 })).toBe(true);
    expect(isRenderableRoute({ id: "bad", coordinates: [[999, 21.0], [105.9, 21.1]], source: "MOCK", generatedAt: 1 })).toBe(false);
  });

  it("keeps map/list selection synchronized through one contract", () => {
    expect(selectMapItem({ source: "SYSTEM" }, "road-1", "LIST")).toEqual({ selectedId: "road-1", source: "LIST" });
    expect(selectMapItem({ selectedId: "road-1", source: "LIST" }, undefined, "MAP")).toEqual({ source: "MAP" });
  });
});
