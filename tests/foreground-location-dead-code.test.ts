import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) return [];
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
const mobile = [...sources("apps/mobile/app"), ...sources("apps/mobile/src")];

describe("Checkpoint 02: cached fixes are never promoted to READY outside the GPS gate", () => {
  it("the superseded one-shot adapter that returned READY from a 60 s cache is removed", () => {
    expect(existsSync("apps/mobile/src/infrastructure/location/foreground-location.ts")).toBe(false);
    expect(mobile.filter((f) => readFileSync(f, "utf8").includes("requestForegroundLocation"))).toEqual([]);
  });
  it("only the lifecycle hook reads native positions, and it routes them through the GPS contract", () => {
    const readers = mobile.filter((f) => /getLastKnownPositionAsync|getCurrentPositionAsync|watchPositionAsync/.test(readFileSync(f, "utf8")));
    expect(readers).toEqual(["apps/mobile/src/infrastructure/location/useForegroundLocationLifecycle.ts"]);
    const hook = readFileSync(readers[0]!, "utf8");
    expect(hook).toContain('acceptPosition(lastKnown, "LAST_KNOWN", token)');
    expect(hook).toContain('if (source !== "WATCH"');
  });
});
