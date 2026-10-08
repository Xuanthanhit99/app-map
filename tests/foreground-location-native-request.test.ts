import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("foreground location native request regression", () => {
  it("uses cached location opportunistically and keeps the foreground watcher authoritative", () => {
    const source = readFileSync(
      "apps/mobile/src/infrastructure/location/useForegroundLocationLifecycle.ts",
      "utf8",
    );

    const lastKnown = source.indexOf("await Location.getLastKnownPositionAsync(");
    const watch = source.indexOf("await Location.watchPositionAsync(");

    expect(lastKnown).toBeGreaterThan(-1);
    expect(watch).toBeGreaterThan(-1);
    expect(lastKnown).toBeLessThan(watch);
    expect(source).not.toContain("Location.getCurrentPositionAsync(");
    expect(source).toContain("if (!mounted || !foreground || startingRef.current || subscription) return;");
    expect(source).toContain('foreground = next === "active"');
    expect(source).toContain("if (!mounted || !foreground) return;");
    expect(source).toContain("Location.getProviderStatusAsync()");
    expect(source).toContain('debugLocation("services"');
    expect(source).toContain("accuracy: Location.Accuracy.Balanced");
    expect(source).toContain("distanceInterval: 10");
    expect(source).toContain("timeInterval: 5_000");
    expect(source).toContain("const POSITION_LOGS_ENABLED = false;");
    expect(source).toContain('debugLocation("watch:request")');
    expect(source).toContain('debugLocation("watch:registered")');
    expect(source).toContain('debugLocation("position"');
    expect(source).toContain('debugLocation("start:error"');
  });
});
