// SEO crawl (G8). Usage: WEB_URL=https://… [EXPECT_INDEXING=true] node seo-crawl.mjs
// Checks every sitemap URL plus known public/private pages: status, <title>, meta description,
// canonical (absolute, self, same host), robots meta, JSON-LD parses, one <h1>, lang, and the
// public/private indexing boundary. Writes docs/release/evidence/<EVIDENCE_DIR>/seo-crawl.json.
import { mkdirSync, writeFileSync } from "node:fs";

const WEB = (process.env.WEB_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const EXPECT_INDEXING = process.env.EXPECT_INDEXING === "true";
const OUT = new URL(`../docs/release/evidence/${process.env.EVIDENCE_DIR ?? "local"}/`, import.meta.url);
mkdirSync(OUT, { recursive: true });

const PRIVATE = ["/tai-khoan", "/quan-tri", "/dang-nhap", "/dang-ky", "/quen-mat-khau", "/dat-lai-mat-khau", "/xac-minh-email"];
const PUBLIC_EXTRA = ["/", "/ban-do", "/di-dau", "/du-lieu", "/gioi-thieu", "/tro-giup", "/quyen-rieng-tu", "/dieu-khoan", "/cau-chuyen"];
const issues = [];
const pages = [];
const flag = (url, code, detail = "") => issues.push({ url, code, detail });
const attr = (html, re) => re.exec(html)?.[1] ?? null;

async function get(path, opts = {}) {
  const t = Date.now();
  const r = await fetch(path.startsWith("http") ? path : `${WEB}${path}`, { redirect: "manual", headers: { "user-agent": "REALITY-seo-crawl/1.0" }, ...opts });
  return { r, ms: Date.now() - t, body: r.status < 300 ? await r.text() : "" };
}

const robots = await get("/robots.txt");
const disallowAll = /Disallow:\s*\/\s*$/m.test(robots.body) && !/Allow:\s*\/\s*$/m.test(robots.body);
if (EXPECT_INDEXING && disallowAll) flag("/robots.txt", "ROBOTS_BLOCKS_PRODUCTION");
if (!EXPECT_INDEXING && !disallowAll) flag("/robots.txt", "NON_PRODUCTION_INDEXABLE");
const sitemap = await get("/sitemap.xml");
if (sitemap.r.status !== 200) flag("/sitemap.xml", "SITEMAP_STATUS", String(sitemap.r.status));
const sitemapUrls = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const targets = [...new Set([...PUBLIC_EXTRA.map((p) => `${WEB}${p}`), ...sitemapUrls.map((u) => u.replace(/^https?:\/\/[^/]+/, WEB))])];
for (const url of targets) {
  const { r, ms, body } = await get(url);
  const path = new URL(url).pathname;
  const page = { path, status: r.status, ms };
  pages.push(page);
  if (r.status !== 200) { flag(path, "STATUS", String(r.status)); continue; }
  const title = attr(body, /<title>([^<]*)<\/title>/);
  const desc = attr(body, /<meta name="description" content="([^"]*)"/);
  const canonical = attr(body, /<link rel="canonical" href="([^"]+)"/);
  const robotsMeta = attr(body, /<meta name="robots" content="([^"]+)"/);
  const lang = attr(body, /<html[^>]*lang="([^"]+)"/);
  const h1 = (body.match(/<h1[\s>]/g) ?? []).length;
  Object.assign(page, { title, canonical, robots: robotsMeta, h1 });
  if (!title || title.length < 10) flag(path, "TITLE_MISSING_OR_SHORT", title ?? "");
  if (title && title.length > 70) flag(path, "TITLE_LONG", String(title.length));
  if (!desc || desc.length < 50) flag(path, "DESCRIPTION_MISSING_OR_SHORT", String(desc?.length ?? 0));
  if (lang !== "vi") flag(path, "LANG", lang ?? "");
  if (h1 !== 1) flag(path, "H1_COUNT", String(h1));
  if (/noindex/.test(robotsMeta ?? "")) flag(path, "PUBLIC_PAGE_NOINDEX", robotsMeta);
  if (!canonical) flag(path, "CANONICAL_MISSING");
  else {
    const c = new URL(canonical);
    if (c.pathname.replace(/\/$/, "") !== path.replace(/\/$/, "")) flag(path, "CANONICAL_NOT_SELF", canonical);
  }
  for (const m of body.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); if (!j["@context"]) flag(path, "JSONLD_NO_CONTEXT"); } catch { flag(path, "JSONLD_INVALID"); }
  }
  if (ms > 1500) flag(path, "SLOW_TTFB_PLUS_HTML", `${ms} ms`);
}

for (const p of PRIVATE) {
  const { r, body } = await get(p);
  const robotsMeta = attr(body, /<meta name="robots" content="([^"]+)"/);
  const redirectsToLogin = [302, 303, 307, 308].includes(r.status);
  const noindex = /noindex/.test(robotsMeta ?? "");
  pages.push({ path: p, status: r.status, robots: robotsMeta, private: true });
  if (!redirectsToLogin && !noindex) flag(p, "PRIVATE_PAGE_INDEXABLE", `${r.status} ${robotsMeta ?? ""}`);
  if (sitemapUrls.some((u) => new URL(u).pathname.startsWith(p))) flag(p, "PRIVATE_PAGE_IN_SITEMAP");
}

const summary = { webUrl: WEB, runAt: new Date().toISOString(), expectIndexing: EXPECT_INDEXING, robotsDisallowAll: disallowAll, sitemapUrls: sitemapUrls.length, pagesChecked: pages.length, issues, pages };
writeFileSync(new URL("seo-crawl.json", OUT), JSON.stringify(summary, null, 2));
console.log(`checked ${pages.length} pages (${sitemapUrls.length} in sitemap); ${issues.length} issues`);
for (const i of issues) console.log(`  ${i.code} ${i.url} ${i.detail}`);
process.exit(issues.length ? 1 : 0);
