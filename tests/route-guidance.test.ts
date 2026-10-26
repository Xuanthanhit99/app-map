import { describe, expect, it } from "vitest";
import { formatDistanceVi, nextInstruction, projectOntoRoute } from "../src/routing/guidance";
import { TomTomRoutingProvider } from "../apps/api/src/tomtom-routing-provider";
import type { Coordinate } from "../src/map/map-contract";

// ~1.1 km straight east along latitude 21.03, then north.
const route: Coordinate[] = [[105.85, 21.03], [105.86, 21.03], [105.86, 21.04]];
const steps = [
  { routeOffsetMeters: 0, maneuver: "DEPART", text: "Đi về hướng đông" },
  { routeOffsetMeters: 1038, maneuver: "TURN_LEFT", text: "Rẽ trái vào Phố A", street: "Phố A" },
  { routeOffsetMeters: 2150, maneuver: "ARRIVE", text: "Bạn đã đến nơi" },
];

describe("turn-by-turn guidance from provider instructions", () => {
  it("projects positions onto the route", () => {
    const p = projectOntoRoute(route, [105.855, 21.0301])!;
    expect(p.alongMeters).toBeGreaterThan(500);
    expect(p.alongMeters).toBeLessThan(540);
    expect(p.offRouteMeters).toBeLessThan(15);
  });

  it("announces the next maneuver ahead and its distance", () => {
    const n = nextInstruction(route, steps, [105.855, 21.03]);
    expect(n.status).toBe("NEXT");
    if (n.status !== "NEXT") return;
    expect(n.instruction.maneuver).toBe("TURN_LEFT");
    expect(n.inMeters).toBeGreaterThan(500);
    expect(formatDistanceVi(n.inMeters)).toMatch(/^Sau \d+ m$/);
  });

  it("moves on after passing a maneuver, and finishes at the end", () => {
    const n = nextInstruction(route, steps, [105.86, 21.035]);
    expect(n.status === "NEXT" && n.instruction.maneuver).toBe("ARRIVE");
    expect(nextInstruction(route, steps.slice(0, 2), [105.86, 21.039]).status).toBe("FINISHED");
  });

  it("suspends guidance off route and never invents steps", () => {
    expect(nextInstruction(route, steps, [105.855, 21.035]).status).toBe("OFF_ROUTE");
    expect(nextInstruction(route, null, [105.855, 21.03]).status).toBe("NO_GUIDANCE");
    expect(nextInstruction(route, [], [105.855, 21.03]).status).toBe("NO_GUIDANCE");
  });

  it("TomTom: requests Vietnamese guidance and parses well-formed steps; malformed guidance degrades to route-only", async () => {
    let requested = "";
    const body = (guidance: unknown) => ({ routes: [{ summary: { lengthInMeters: 2150, travelTimeInSeconds: 300 }, legs: [{ points: route.map(([lng, lat]) => ({ latitude: lat, longitude: lng })) }], guidance }] });
    const provider = (g: unknown) => new TomTomRoutingProvider("k", (async (url: URL) => { requested = String(url); return new Response(JSON.stringify(body(g)), { status: 200 }); }) as unknown as typeof fetch);
    const ok = await provider({ instructions: steps.map((s) => ({ routeOffsetInMeters: s.routeOffsetMeters, maneuver: s.maneuver, message: s.text, street: s.street })) }).route({ origin: route[0]!, destination: route[2]!, mode: "DRIVING" });
    expect(requested).toContain("instructionsType=text");
    expect(requested).toContain("language=vi-VN");
    expect(ok.status === "SUCCESS" && ok.instructions?.map((i) => i.maneuver)).toEqual(["DEPART", "TURN_LEFT", "ARRIVE"]);
    const bad = await provider({ instructions: [{ routeOffsetInMeters: 500, maneuver: "X", message: "a" }, { routeOffsetInMeters: 100, maneuver: "Y", message: "b" }] }).route({ origin: route[0]!, destination: route[2]!, mode: "DRIVING" });
    expect(bad.status === "SUCCESS" && bad.instructions).toBeUndefined();
  });
});
