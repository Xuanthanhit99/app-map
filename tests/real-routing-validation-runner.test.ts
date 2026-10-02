import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("real routing validation runner", () => {
  it("is CJS-safe and does not use top-level await", () => {
    const source = readFileSync("apps/api/scripts/validate-real-routing.ts", "utf8");

    expect(source).toMatch(/async function main\(\): Promise<void>/);
    expect(source).toMatch(/void main\(\)\.catch/);
    expect(source).not.toMatch(/^\s*const\s+result\s*=\s*await\s+/m);
  });
});
