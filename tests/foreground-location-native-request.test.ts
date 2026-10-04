import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("foreground location native request regression", () => {
  it("registers the foreground watcher before awaiting the one-shot fix", () => {
    const source = readFileSync(
      "apps/mobile/src/infrastructure/location/useForegroundLocationLifecycle.ts",
      "utf8",
    );

    const watch = source.indexOf("await Location.watchPositionAsync(");
    const current = source.indexOf("await Location.getCurrentPositionAsync(");

    expect(watch).toBeGreaterThan(-1);
    expect(current).toBeGreaterThan(-1);
    expect(watch).toBeLessThan(current);
    expect(source).toContain("if (startingRef.current || subscription) return;");
  });
});
