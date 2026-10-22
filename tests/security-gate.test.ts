import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const dir = mkdtempSync(join(tmpdir(), "secgate-"));

function adv(pkg: string, id: string, severity: string) {
  return [pkg, { name: pkg, severity, isDirect: false, via: [{ source: 1, name: pkg, title: `${pkg} issue`, url: `https://github.com/advisories/${id}`, severity, range: "*" }], effects: [], range: "*", nodes: [`node_modules/${pkg}`], fixAvailable: false }];
}
const EXCEPTED = [
  adv("braces", "GHSA-vfj7-8cjw-p6xm", "high"),
  adv("decode-uri-component", "GHSA-vcc3-ghjq-m6fr", "moderate"),
  adv("image-size", "GHSA-5p2g-fcmc-qvqq", "high"),
  adv("image-size", "GHSA-w3rx-r6r6-pgpr", "high"),
  adv("node-forge", "GHSA-86w9-cpqp-85rv", "high"),
  adv("sprintf-js", "GHSA-hp3w-g68c-fv3c", "moderate"),
];

function run(entries: unknown[][], extraArgs: string[] = []): { code: number; out: string } {
  const vulnerabilities: Record<string, any> = {};
  for (const [name, v] of entries as [string, any][]) {
    if (vulnerabilities[name]) vulnerabilities[name].via.push(...v.via);
    else vulnerabilities[name] = structuredClone(v);
  }
  const f = join(dir, `audit-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(f, JSON.stringify({ vulnerabilities, metadata: { vulnerabilities: {} } }));
  try {
    const out = execFileSync("node", ["scripts/security-gate.mjs", "--audit-json", f, ...extraArgs], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e: any) {
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

describe("security gate (scripts/security-gate.mjs)", () => {
  it("passes when every moderate/high advisory has a documented exception", () => {
    const r = run(EXCEPTED);
    expect(r.code).toBe(0);
    expect(r.out).toContain("security gate: PASS");
  });

  it("fails on an advisory without an exception", () => {
    const r = run([...EXCEPTED, adv("left-pad", "GHSA-xxxx-yyyy-zzzz", "high")]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("unexcepted high: left-pad");
  });

  it("fails on any critical advisory, even for an excepted package", () => {
    const r = run([...EXCEPTED, adv("braces", "GHSA-crit-crit-crit", "critical")]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("CRITICAL braces");
  });

  it("fails when a package excepted as build-tool ships in a bundle", () => {
    const map = join(dir, "bundle.js.map");
    writeFileSync(map, JSON.stringify({ version: 3, sources: ["/node_modules/react/index.js", "/node_modules/braces/index.js"], mappings: "" }));
    const r = run(EXCEPTED, ["--bundle-map", map]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("braces is excepted as build-tool but ships in a bundle");
  });

  it("warns (does not fail) on stale exceptions", () => {
    const r = run(EXCEPTED.filter(([n]) => n !== "sprintf-js"));
    expect(r.code).toBe(0);
    expect(r.out).toContain("stale exception sprintf-js");
  });
});
