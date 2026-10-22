#!/usr/bin/env node
/**
 * Enforceable dependency security gate.
 *
 *   node scripts/security-gate.mjs [--bundle-map <file-or-dir>]... [--report <file>]
 *
 * Fails (exit 1) when:
 *  - any critical advisory is present (critical cannot be excepted);
 *  - any moderate/high advisory is not listed in security/audit-exceptions.json;
 *  - an exception has expired or is missing required fields;
 *  - a package excepted as build-tool/dev-tool appears in a shipped bundle source map
 *    (the classification is verified, not asserted).
 * Low advisories and exceptions that no longer match anything are reported as warnings.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const bundleMaps = [];
let reportPath = null;
let auditFile = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--bundle-map") bundleMaps.push(args[++i]);
  else if (args[i] === "--report") reportPath = args[++i];
  else if (args[i] === "--audit-json") auditFile = args[++i];
}

const REQUIRED = ["package", "advisories", "severity", "scope", "path", "artifact", "justification", "evidence", "remediation", "expires"];
const SCOPES = new Set(["build-tool", "dev-tool", "runtime-unreachable"]);

function runAudit() {
  if (auditFile) return JSON.parse(readFileSync(auditFile, "utf8"));
  try {
    return JSON.parse(execFileSync("npm", ["audit", "--json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }));
  } catch (e) {
    // npm audit exits 1 when vulnerabilities exist; stdout still carries the JSON report.
    if (e.stdout) return JSON.parse(e.stdout);
    throw e;
  }
}

function mapFiles(p) {
  const abs = resolve(ROOT, p);
  if (!statSync(abs).isDirectory()) return [abs];
  const out = [];
  for (const name of readdirSync(abs, { recursive: true })) if (String(name).endsWith(".map")) out.push(join(abs, String(name)));
  return out;
}

function bundledPackages(files) {
  const pk = new Set();
  for (const f of files) {
    const m = JSON.parse(readFileSync(f, "utf8"));
    for (const s of m.sources ?? []) {
      const i = s.lastIndexOf("node_modules/");
      if (i < 0) continue;
      const r = s.slice(i + 13).split("/");
      pk.add(r[0].startsWith("@") ? `${r[0]}/${r[1]}` : r[0]);
    }
  }
  return pk;
}

const failures = [];
const warnings = [];
const policy = JSON.parse(readFileSync(join(ROOT, "security/audit-exceptions.json"), "utf8"));
const today = new Date().toISOString().slice(0, 10);

for (const ex of policy.exceptions) {
  for (const f of REQUIRED) if (ex[f] === undefined || ex[f] === "" || (Array.isArray(ex[f]) && ex[f].length === 0)) failures.push(`exception ${ex.package ?? "?"}: missing field "${f}"`);
  if (!SCOPES.has(ex.scope)) failures.push(`exception ${ex.package}: invalid scope "${ex.scope}"`);
  if (ex.severity === "critical") failures.push(`exception ${ex.package}: critical advisories cannot be excepted`);
  if (ex.expires && ex.expires < today) failures.push(`exception ${ex.package}: expired on ${ex.expires} — re-review or fix`);
}

const audit = runAudit();
const found = [];
for (const [name, v] of Object.entries(audit.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via !== "object") continue; // transitive marker; the advisory itself is listed under its own package
    found.push({ package: name, id: via.url.split("/").pop(), severity: via.severity, title: via.title, range: via.range, nodes: v.nodes });
  }
}

const used = new Set();
for (const a of found) {
  if (a.severity === "low" || a.severity === "info") { warnings.push(`low: ${a.package} ${a.id} ${a.title}`); continue; }
  if (a.severity === "critical") { failures.push(`CRITICAL ${a.package} ${a.id} ${a.title} — must be fixed`); continue; }
  const ex = policy.exceptions.find((e) => e.package === a.package && e.advisories.includes(a.id));
  if (!ex) { failures.push(`unexcepted ${a.severity}: ${a.package} ${a.id} ${a.title} (${a.nodes.join(", ")})`); continue; }
  used.add(`${ex.package}:${a.id}`);
}
for (const ex of policy.exceptions) for (const id of ex.advisories) if (!used.has(`${ex.package}:${id}`)) warnings.push(`stale exception ${ex.package} ${id}: no longer reported — remove it`);

let bundleReport = null;
if (bundleMaps.length) {
  const files = bundleMaps.flatMap(mapFiles);
  if (files.length === 0) failures.push(`--bundle-map given but no .map files found in ${bundleMaps.join(", ")}`);
  const pk = bundledPackages(files);
  bundleReport = { maps: files.length, packages: pk.size, excepted: {} };
  for (const ex of policy.exceptions) {
    const shipped = pk.has(ex.package);
    bundleReport.excepted[ex.package] = shipped ? "IN BUNDLE" : "absent";
    if (shipped && ex.scope !== "runtime-unreachable") failures.push(`${ex.package} is excepted as ${ex.scope} but ships in a bundle — classification is wrong`);
  }
}

const summary = {
  checkedAt: new Date().toISOString(),
  totals: audit.metadata?.vulnerabilities,
  advisories: found.map(({ package: p, id, severity, title }) => ({ package: p, id, severity, title, status: severity === "critical" ? "FAIL" : used.has(`${p}:${id}`) ? "EXCEPTED" : severity === "low" ? "WARN" : "FAIL" })),
  bundle: bundleReport,
  warnings,
  failures,
  result: failures.length ? "FAIL" : "PASS",
};
if (reportPath) { mkdirSync(dirname(resolve(ROOT, reportPath)), { recursive: true }); } if (reportPath) writeFileSync(resolve(ROOT, reportPath), JSON.stringify(summary, null, 2) + "\n");
for (const a of summary.advisories) console.log(`${a.status.padEnd(8)} ${a.severity.padEnd(9)} ${a.package} ${a.id} — ${a.title}`);
if (bundleReport) console.log(`bundle maps: ${bundleReport.maps}, packages shipped: ${bundleReport.packages}; excepted packages: ${JSON.stringify(bundleReport.excepted)}`);
for (const w of warnings) console.log(`warning: ${w}`);
for (const f of failures) console.error(`FAIL: ${f}`);
console.log(`security gate: ${summary.result}`);
process.exit(failures.length ? 1 : 0);
