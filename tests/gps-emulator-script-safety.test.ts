import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/gps-emulator-diagnose.ps1", "utf8");
// Executable lines only: drop the <# #> help block, @" "@ guidance text and # comments.
const code = script
  .replace(/<#[\s\S]*?#>/g, "")
  .replace(/@"[\s\S]*?"@/g, "")
  .split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

describe("GPS emulator diagnostic script safety (checkpoint 02)", () => {
  it("contains no destructive or configuration-changing commands", () => {
    for (const forbidden of [/wipe/i, /pm\s+clear/i, /uninstall/i, /settings\s+put/i, /set-location-enabled/i, /appops\s+set/i, /pm\s+(grant|revoke)/i, /-wipe-data/i, /\brm\s/i, /factory/i]) {
      expect(code).not.toMatch(forbidden);
    }
  });
  it("sends geo fix as longitude then latitude, culture-invariant", () => {
    expect(code).toContain("A emu geo fix $LonS $LatS");
    expect(code).toContain("$Lon.ToString([cultureinfo]::InvariantCulture)");
    expect(code).not.toMatch(/geo fix \$Lat/);
  });
  it("targets one explicit device serial", () => {
    expect(code).toContain("function A { adb -s $Serial @args }");
    expect(code.match(/^\s*adb\s+(shell|emu)/gm)).toBeNull();
  });
  it("does not conclude a provider fault from zero reports and distinguishes fused from gps", () => {
    expect(script).toMatch(/do not conclude a provider fault from 'reports = 0' alone/i);
    expect(script).toContain("FUSED provider");
    expect(script).toContain("Which provider did the Reality request land on?");
  });
});
