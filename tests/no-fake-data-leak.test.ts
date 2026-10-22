import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === "node_modules" || f === "dist" || f === ".next" || f === ".expo") return [];
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|mjs)$/.test(f) ? [p] : [];
  });
}
const CLIENT_SOURCES = [...files("apps/mobile/app"), ...files("apps/mobile/src"), ...files("apps/web/src")];

describe("no fabricated live data in client code (§3.3)", () => {
  it("client screens never hard-code a KNOWN live state, a development fixture, or a sample destination", () => {
    const offenders = CLIENT_SOURCES.filter((f) => {
      const s = readFileSync(f, "utf8");
      return /truthStatus:\s*"KNOWN"/.test(s) || /DEVELOPMENT_FIXTURE/.test(s) || /SAMPLE_DESTINATION/.test(s) || /Cà phê bên hồ/.test(s);
    });
    expect(offenders).toEqual([]);
  });
  it("the routing double and fixture seeder are confined to development", () => {
    const routing = readFileSync("apps/api/src/dev-routing.ts", "utf8");
    expect(routing).toContain('id: "dev-straight-line"');
    const config = readFileSync("apps/api/src/config.ts", "utf8");
    expect(config).toContain("DEV_FAKE_ROUTING_FORBIDDEN_IN_");
    expect(config).toContain("DEV_FIXTURES_FORBIDDEN_IN_");
    const seeder = readFileSync("apps/api/scripts/seed-dev-fixtures.ts", "utf8");
    expect(seeder).toContain('config.env !== "development"');
  });
});
