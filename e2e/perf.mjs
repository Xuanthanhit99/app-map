// Lab performance + accessibility (Lighthouse) for key public pages, mobile and desktop profiles.
// Usage: WEB_URL=https://… node perf.mjs  → docs/release/evidence/<EVIDENCE_DIR>/lighthouse.json
// Lab numbers are indicative; field Core Web Vitals need real-user data (CrUX/RUM) after launch.
import chromium from "@sparticuz/chromium";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { mkdirSync, writeFileSync } from "node:fs";

const WEB = (process.env.WEB_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const OUT = new URL(`../docs/release/evidence/${process.env.EVIDENCE_DIR ?? "local"}/`, import.meta.url);
mkdirSync(OUT, { recursive: true });
const PAGES = (process.env.PAGES ?? "/,/ban-do,/di-dau,/du-lieu").split(",");
// Budgets (lab, mobile profile). Failing a budget is reported, not hidden.
const BUDGET = { performance: 0.8, accessibility: 0.95, seo: 0.9, "best-practices": 0.9, lcpMs: 2500, cls: 0.1, tbtMs: 300 };

const chrome = await chromeLauncher.launch({ chromePath: await chromium.executablePath(), chromeFlags: [...chromium.args.filter((a) => !a.startsWith("--single-process")), "--headless=new"] });
const rows = [];
for (const formFactor of ["mobile", "desktop"]) {
  for (const path of PAGES) {
    const r = await lighthouse(`${WEB}${path}`, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "seo", "best-practices"] },
      formFactor === "desktop" ? { extends: "lighthouse:default", settings: { formFactor: "desktop", screenEmulation: { mobile: false, width: 1536, height: 960, deviceScaleFactor: 1, disabled: false }, throttlingMethod: "simulate" } } : undefined);
    const lhr = r.lhr;
    const row = {
      path, formFactor,
      performance: lhr.categories.performance.score, accessibility: lhr.categories.accessibility.score, seo: lhr.categories.seo.score, bestPractices: lhr.categories["best-practices"].score,
      lcpMs: Math.round(lhr.audits["largest-contentful-paint"].numericValue), cls: Number(lhr.audits["cumulative-layout-shift"].numericValue.toFixed(3)),
      tbtMs: Math.round(lhr.audits["total-blocking-time"].numericValue), fcpMs: Math.round(lhr.audits["first-contentful-paint"].numericValue),
      runtimeError: lhr.runtimeError?.code ?? null,
      seoFails: Object.values(lhr.audits).filter((a) => lhr.categories.seo.auditRefs.some((x) => x.id === a.id) && a.score === 0).map((a) => a.id),
    };
    row.budget = formFactor === "mobile" ? Object.entries({ performance: row.performance >= BUDGET.performance, accessibility: row.accessibility >= BUDGET.accessibility, seo: row.seo >= BUDGET.seo, bestPractices: row.bestPractices >= BUDGET["best-practices"], lcp: row.lcpMs <= BUDGET.lcpMs, cls: row.cls <= BUDGET.cls, tbt: row.tbtMs <= BUDGET.tbtMs }).filter(([, ok]) => !ok).map(([k]) => k) : [];
    rows.push(row);
    console.log(`${formFactor.padEnd(7)} ${path.padEnd(10)} perf ${row.performance} a11y ${row.accessibility} seo ${row.seo} bp ${row.bestPractices} LCP ${row.lcpMs}ms CLS ${row.cls} TBT ${row.tbtMs}ms${row.budget.length ? `  BUDGET MISS: ${row.budget.join(",")}` : ""}${row.seoFails.length ? `  seo-fail: ${row.seoFails.join(",")}` : ""}`);
  }
}
await chrome.kill();
writeFileSync(new URL("lighthouse.json", OUT), JSON.stringify({ webUrl: WEB, runAt: new Date().toISOString(), budget: BUDGET, note: "Lab measurements (simulated throttling). Not field Core Web Vitals.", rows }, null, 2));
