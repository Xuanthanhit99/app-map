import { describe, expect, it } from "vitest";
import { validateTomTomGuidance } from "../src/routing/navigation-guidance";
import type { RouteGeometry } from "../src/map/map-contract";

const route: RouteGeometry = { id: "fixture", source: "ROUTING_ENGINE", generatedAt: 1, coordinates: [[105.85, 21.02], [105.851, 21.021], [105.852, 21.022]] };
const instructions = [
  { maneuver: "DEPART", instructionType: "LOCATION_DEPARTURE", routeOffsetInMeters: 0, point: { longitude: 105.85, latitude: 21.02 }, pointIndex: 0, message: "Depart" },
  { maneuver: "TURN_RIGHT", instructionType: "TURN", routeOffsetInMeters: 100, point: { longitude: 105.851, latitude: 21.021 }, pointIndex: 1, message: "Turn right" },
  { maneuver: "ARRIVE", instructionType: "LOCATION_ARRIVAL", routeOffsetInMeters: 200, point: { longitude: 105.852, latitude: 21.022 }, pointIndex: 2, message: "Arrive" },
];
const validate = (items: unknown, geometry = route, distance = 200) => validateTomTomGuidance(items, geometry, distance);
const has = (items: unknown, code: string, geometry = route, distance = 200) => validate(items, geometry, distance).issues.some(x => x.code === code);

describe("E-02 TomTom guidance parser and validator", () => {
  it("accepts valid geometry-linked guidance", () => {
    const result = validate(instructions);
    expect(result.dataValid).toBe(true);
    expect(result.guidanceReady).toBe(true);
    expect(result.maneuvers[1]?.point).toEqual([105.851, 21.021]);
  });
  it("rejects empty guidance", () => expect(has([], "EMPTY_GUIDANCE")).toBe(true));
  it("rejects missing maneuver and offset", () => expect(has([{ ...instructions[0], maneuver: undefined }], "INVALID_INSTRUCTION")).toBe(true));
  it("accepts unknown maneuver as data but blocks guidance", () => {
    const result = validate([{ ...instructions[0], maneuver: "FUTURE_CODE" }]);
    expect(result.dataValid).toBe(true);
    expect(result.guidanceReady).toBe(false);
    expect(result.issues.some(x => x.code === "UNKNOWN_MANEUVER")).toBe(true);
  });
  it("rejects point index outside geometry", () => expect(has([{ ...instructions[0], pointIndex: 999 }], "INVALID_POINT_INDEX")).toBe(true));
  it("rejects point mismatch", () => expect(has([{ ...instructions[0], point: { longitude: 105.9, latitude: 21.02 } }], "POINT_MISMATCH")).toBe(true));
  it("rejects descending offsets", () => expect(has([instructions[1], instructions[0]], "OFFSET_ORDER")).toBe(true));
  it("rejects offsets exceeding route length", () => expect(has([instructions[2]], "OFFSET_EXCEEDS_ROUTE", route, 100)).toBe(true));
  it("rejects invalid coordinate", () => expect(has([{ ...instructions[0], point: { longitude: 200, latitude: 21.02 } }], "INVALID_COORDINATE")).toBe(true));
  it("allows absent message as data but blocks text guidance", () => {
    const result = validate([{ ...instructions[0], message: undefined }]);
    expect(result.dataValid).toBe(true);
    expect(result.guidanceReady).toBe(false);
    expect(result.issues.some(x => x.code === "MISSING_MESSAGE")).toBe(true);
  });
  it("allows absent pointIndex as data but blocks guidance", () => {
    const result = validate([{ ...instructions[0], pointIndex: undefined }]);
    expect(result.dataValid).toBe(true);
    expect(result.guidanceReady).toBe(false);
    expect(result.issues.some(x => x.code === "MISSING_POINT_INDEX")).toBe(true);
  });
  it("rejects malformed route geometry", () => {
    expect(has(instructions, "INVALID_GEOMETRY", { ...route, coordinates: [] })).toBe(true);
  });
});
