import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("real routing validation runner", () => {
  it("uses a CJS-safe async entrypoint instead of top-level await", () => {
    const source = readFileSync("apps/api/scripts/validate-real-routing.ts", "utf8");

    expect(source).toMatch(/async function main\(\): Promise<void>\s*\{/);
    expect(source).toMatch(/void main\(\)\.catch\(/);
    expect(source).not.toMatch(/^for\s*\([^\n]+\)\s*\{\s*\n\s*const\s+result\s*=\s*await\s+/m);
  });
});
