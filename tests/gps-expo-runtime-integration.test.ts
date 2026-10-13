import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("apps/mobile/src/infrastructure/location/useForegroundLocationLifecycle.ts", "utf8");

describe("E-04C Expo runtime integration boundary", () => {
  it("wires the pure GPS lifecycle contract", () => {
    expect(source).toContain("createGPSLifecycleContract()");
    expect(source).toContain("gps.start()");
    expect(source).toContain("gps.accept(token, position, source");
  });
  it("preserves provenance from cached and live Expo calls", () => {
    expect(source).toContain('acceptPosition(lastKnown, "LAST_KNOWN", token)');
    expect(source).toContain('acceptPosition(position, "WATCH", token)');
    expect(source).toContain('if (source !== "WATCH"');
  });
  it("guards asynchronous results and callbacks by session generation", () => {
    expect(source).toContain("validSession(token)");
    expect(source).toContain("if (!validSession(token)) return;");
    expect(source).toContain("registered.remove()");
  });
  it("invalidates session on background, restart and disposal", () => {
    expect(source.match(/gps\.background\(\)/g)?.length).toBe(2);
    expect(source).toContain("gps.dispose()");
    expect(source).toContain("resetLocation()");
    expect(source).toContain('setState({ status: "IDLE" })');
  });
  it("does not introduce a navigation start or policy bypass", () => {
    expect(source).not.toContain("canStart: true");
    expect(source).not.toContain("navigationEligible: true");
    expect(source).not.toContain("getCurrentPositionAsync(");
  });
});
