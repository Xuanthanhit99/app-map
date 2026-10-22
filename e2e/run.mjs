// REALITY browser E2E (G3/G7/G10 evidence). Usage:
//   WEB_URL=http://127.0.0.1:3000 DATABASE_URL=postgres://… node run.mjs
// Requires a running API + web against a non-production database. DATABASE_URL is used only to promote
// a freshly created E2E user to admin (no other direct writes).
import chromium from "@sparticuz/chromium";
import { chromium as pw } from "playwright-core";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";

const WEB = process.env.WEB_URL ?? "http://127.0.0.1:3000";
const OUT = new URL(`../docs/release/evidence/${process.env.EVIDENCE_DIR ?? "local"}/`, import.meta.url);
mkdirSync(OUT, { recursive: true });
const axeSource = readFileSync(new URL("./node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const run = Date.now().toString(36);
const results = [];
const consoleErrors = [];
const axeFindings = [];
const VIEWPORTS = { desktop: { viewport: { width: 1536, height: 960 } }, mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } };
const HOAN_KIEM = { latitude: 21.0289, longitude: 105.8525, accuracy: 15 };

// The serverless Chromium build runs single-process: one browser per context is the stable setup.
const executablePath = await chromium.executablePath();
const browsers = [];

async function context(kind, opts = {}) {
  const browser = await pw.launch({ executablePath, args: [...chromium.args, "--disable-dev-shm-usage"], headless: true });
  browsers.push(browser);
  const ctx = await browser.newContext({ ...VIEWPORTS[kind], locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", geolocation: HOAN_KIEM, permissions: ["geolocation"], ...opts });
  // Third-party tiles are unreachable in the sandbox; block them to keep runs deterministic (basemap only).
  await ctx.route(/tile\.openstreetmap\.org|api\.maptiler\.com/, (r) => r.abort());
  const close = ctx.close.bind(ctx);
  ctx.close = async () => { await close().catch(() => undefined); await browser.close().catch(() => undefined); };
  return ctx;
}
function watch(page, label) {
  page.on("console", (m) => { if (m.type() === "error" && !/tile\.openstreetmap|ERR_FAILED|net::ERR_/.test(m.text())) consoleErrors.push({ label, text: m.text().slice(0, 300) }); });
  page.on("pageerror", (e) => consoleErrors.push({ label, text: `pageerror: ${e.message.slice(0, 300)}` }));
}
let lastPage = null;
async function step(name, fn, page = null) {
  const t = Date.now();
  lastPage = page;
  try { await fn(); results.push({ name, status: "PASS", ms: Date.now() - t }); console.log(`PASS ${name}`); }
  catch (e) { if (lastPage) await lastPage.screenshot({ path: new URL(`FAIL-${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.png`, OUT).pathname }).catch(() => undefined); results.push({ name, status: "FAIL", ms: Date.now() - t, error: String(e?.message ?? e).slice(0, 500) }); console.log(`FAIL ${name}: ${e?.message}`); }
}
async function shot(page, name) { await page.waitForTimeout(400); await page.screenshot({ path: new URL(`${name}.png`, OUT).pathname, fullPage: false }); }
async function axe(page, label) {
  await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] }, rules: { "region": { enabled: false } } })).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })));
  axeFindings.push({ label, violations: r });
  const serious = r.filter((v) => v.impact === "serious" || v.impact === "critical");
  if (serious.length) throw new Error(`axe serious/critical on ${label}: ${serious.map((v) => `${v.id}(${v.nodes})`).join(", ")}`);
}

const userA = { email: `e2e.a.${run}@example.test`, password: "mot cau rat dai de nho 2026", name: "Người thử A" };
const userB = { email: `e2e.b.${run}@example.test`, password: "mot cau rat dai khac 2026", name: "Người thử B" };
const admin = { email: `e2e.admin.${run}@example.test`, password: "quan tri vien e2e 2026!", name: "Kiểm duyệt E2E" };

async function register(page, u) {
  await page.goto(`${WEB}/dang-ky?next=/tai-khoan`);
  await page.fill("#displayName", u.name);
  await page.fill("#email", u.email);
  await page.fill("#password", u.password);
  await page.locator("button[type=submit]:not([disabled])").click();
  await page.waitForURL((u) => new URL(u).pathname === "/tai-khoan", { timeout: 15_000 });
}
async function enableContribution(page) {
  await page.goto(`${WEB}/tai-khoan/quyen-rieng-tu`);
  const row = page.locator("li", { hasText: "Đóng góp công khai" });
  await row.getByRole("button", { name: "Bật" }).click();
  await row.getByRole("button", { name: "Tắt" }).waitFor();
}

for (const kind of ["desktop", "mobile"]) {
  const ctx = await context(kind);
  const page = await ctx.newPage();
  watch(page, kind);
  await step(`${kind}: home renders with honest pulse ledger`, async () => {
    await page.goto(WEB);
    await page.getByRole("heading", { level: 1 }).waitFor();
    if (!(await page.getByText("Nơi không có tín hiệu là nơi chưa biết").isVisible())) throw new Error("ledger missing");
    await shot(page, `${kind}-01-home`);
    await axe(page, `${kind} home`);
  });
  await step(`${kind}: map loads places and opens inspector`, async () => {
    await page.goto(`${WEB}/ban-do?q=Cà phê`);
    await page.locator(".maplibregl-canvas").waitFor({ timeout: 20_000 });
    if (kind === "mobile") await page.locator(".map-side").evaluate((el) => el.setAttribute("data-collapsed", "false"));
    const row = page.locator(".place-row", { hasText: "Cà phê Giảng" });
    await row.waitFor({ timeout: 15_000 });
    await shot(page, `${kind}-02-map-search`);
    await row.click();
    await page.getByRole("heading", { name: "Cà phê Giảng" }).waitFor();
    await shot(page, `${kind}-03-map-inspector`);
  });
  await step(`${kind}: place page is SSR with JSON-LD, canonical and unknown state`, async () => {
    await page.goto(`${WEB}/dia-diem/ca-phe-giang-dev`);
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    if (!ld?.includes("CafeOrCoffeeShop")) throw new Error("JSON-LD missing");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    if (!canonical?.endsWith("/dia-diem/ca-phe-giang-dev")) throw new Error(`canonical ${canonical}`);
    await page.getByText("Chưa rõ:").first().waitFor();
    await shot(page, `${kind}-04-place`);
    await axe(page, `${kind} place`);
  });
  await step(`${kind}: decide page form`, async () => {
    await page.goto(`${WEB}/di-dau`);
    await page.fill("#intent", "uống cà phê yên tĩnh");
    await ctx.setGeolocation(HOAN_KIEM);
    await page.getByRole("button", { name: "Dùng vị trí hiện tại" }).click();
    await page.getByText("Đang dùng vị trí hiện tại").waitFor();
    await page.getByRole("button", { name: "Gợi ý cho tôi" }).click();
    await page.locator(".option").first().waitFor({ timeout: 15_000 });
    await shot(page, `${kind}-05-decide-results`);
    await axe(page, `${kind} decide`);
  });
  await ctx.close();
}

// ── G10 end-to-end: two contributors, decide → journey → impact → arrive → report; admin moderation ──
const ctxA = await context("desktop");
const pageA = await ctxA.newPage(); watch(pageA, "userA");
const ctxB = await context("mobile");
const pageB = await ctxB.newPage(); watch(pageB, "userB");
let journeyUrl = null;

await step("G10: user A registers and opts in to contribution", async () => { await register(pageA, userA); await enableContribution(pageA); await shot(pageA, "desktop-06-privacy"); });
await step("G10: user A saves and watches a place", async () => {
  await pageA.goto(`${WEB}/dia-diem/bai-xe-bo-ho-dev`);
  await pageA.getByRole("button", { name: "Lưu" }).click(); await pageA.getByText("Đã lưu địa điểm.").waitFor();
  await pageA.getByRole("button", { name: "Theo dõi thay đổi" }).click(); await pageA.getByText("Bạn sẽ nhận thông báo").waitFor();
});
await step("G10: user A reports 'Bãi xe đầy' — single report stays unverified", async () => {
  await pageA.goto(`${WEB}/ban-do?place=bai-xe-bo-ho-dev&report=1`);
  await pageA.getByRole("button", { name: /^Tại Bãi xe Bờ Hồ/ }).click();
  await pageA.getByRole("button", { name: "Bãi xe đầy" }).click();
  await pageA.getByRole("button", { name: "Gửi: Bãi xe đầy" }).click();
  await pageA.getByText("chưa xác minh").first().waitFor({ timeout: 15_000 });
  await shot(pageA, "desktop-07-report-unverified");
});
await step("G10: user B (mobile) registers, opts in and corroborates", async () => {
  await register(pageB, userB); await enableContribution(pageB);
  await pageB.goto(`${WEB}/ban-do?place=bai-xe-bo-ho-dev&report=1`);
  await pageB.getByRole("button", { name: /^Tại Bãi xe Bờ Hồ/ }).click();
  await pageB.getByRole("button", { name: "Bãi xe đầy" }).click();
  await pageB.getByRole("button", { name: "Gửi: Bãi xe đầy" }).click();
  await pageB.getByText("tình trạng này giờ được xác nhận").waitFor({ timeout: 15_000 });
  await shot(pageB, "mobile-08-report-corroborated");
});
await step("G10: place now shows KNOWN 'Bãi đầy' with source and freshness; watcher notified", async () => {
  await pageA.goto(`${WEB}/dia-diem/bai-xe-bo-ho-dev`);
  await pageA.locator(".state-card", { hasText: "Bãi đầy" }).waitFor();
  await pageA.getByText("Mới cập nhật").first().waitFor();
  await shot(pageA, "desktop-09-place-known");
  await pageA.goto(`${WEB}/tai-khoan/thong-bao`);
  await pageA.getByText("Bãi đầy").first().waitFor({ timeout: 10_000 });
  await shot(pageA, "desktop-10-notifications");
}, pageA);
await step("G10: decide → start journey → impact → arrive", async () => {
  await pageA.goto(`${WEB}/di-dau`);
  await pageA.fill("#intent", "xem bảo tàng");
  await ctxA.setGeolocation(HOAN_KIEM); // emulated fixes carry the time they were set: refresh so the 30 s policy accepts it
  await pageA.getByRole("button", { name: "Dùng vị trí hiện tại" }).click();
  await pageA.getByText("Đang dùng vị trí hiện tại").waitFor();
  await pageA.getByRole("button", { name: "Gợi ý cho tôi" }).click();
  await pageA.locator(".option").first().getByRole("link", { name: "Bắt đầu hành trình" }).click();
  await ctxA.setGeolocation(HOAN_KIEM);
  await pageA.getByRole("button", { name: "Tính tuyến đường" }).click();
  await pageA.waitForURL(/\/hanh-trinh\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  journeyUrl = pageA.url();
  await pageA.getByRole("button", { name: "Bắt đầu" }).click();
  await pageA.getByText("Đang đi").waitFor();
  await shot(pageA, "desktop-11-journey-active");
  await pageA.getByRole("button", { name: "Đã đến nơi" }).click();
  await pageA.locator(".badge", { hasText: "Đã đến nơi" }).waitFor();
}, pageA);
await step("G10: journey on landscape phone keeps the glance rail", async () => {
  const ctx = await context("mobile", { viewport: { width: 844, height: 390 } });
  const p = await ctx.newPage(); watch(p, "landscape");
  await p.goto(`${WEB}/dang-nhap?next=/hanh-trinh`);
  await p.fill("#email", userA.email); await p.fill("#password", userA.password); await p.locator("button[type=submit]:not([disabled])").click();
  await p.waitForURL((u) => new URL(u).pathname === "/hanh-trinh");
  await p.goto(journeyUrl);
  await p.locator(".journey-panel").waitFor();
  await shot(p, "mobile-landscape-12-journey");
  await ctx.close();
});
await step("G9: data export downloads a JSON copy", async () => {
  const r = await pageA.request.get(`${WEB}/api/proxy/v1/me/export`);
  const body = await r.json();
  if (body.format !== "reality-export/1" || body.reports.length < 1) throw new Error("export incomplete");
});

await step("G9: expired access cookie is silently renewed from the refresh cookie (single-use rotation)", async () => {
  const before = (await ctxA.cookies()).find((c) => c.name === "rt_r")?.value;
  await ctxA.clearCookies({ name: "rt_a" });
  await pageA.goto(`${WEB}/tai-khoan`);
  await pageA.getByRole("heading", { name: /Chào/ }).waitFor();
  const after = (await ctxA.cookies()).find((c) => c.name === "rt_r")?.value;
  if (!after || after === before) throw new Error("refresh token was not rotated");
});
await ctxA.close(); await ctxB.close();
// Admin
await step("Admin: moderator console works with server-side RBAC", async () => {
  const ctx = await context("desktop"); const p = await ctx.newPage(); watch(p, "admin");
  await register(p, admin);
  const r = await p.request.get(`${WEB}/api/proxy/v1/admin/dashboard`);
  if (r.status() !== 403) throw new Error(`expected 403 before promotion, got ${r.status()}`);
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  await db.query("UPDATE users SET role = 'admin' WHERE lower(email) = lower($1)", [admin.email]); await db.end();
  await p.goto(`${WEB}/quan-tri`);
  await p.getByRole("heading", { name: "Tổng quan vận hành" }).waitFor();
  await shot(p, "desktop-13-admin-dashboard");
  await p.goto(`${WEB}/quan-tri/bao-cao`);
  await p.getByRole("button", { name: "Đã đối chứng" }).click();
  await p.locator("table.data").waitFor();
  await shot(p, "desktop-14-admin-moderation");
  await p.goto(`${WEB}/quan-tri/san-sang`);
  await p.getByText("PUBLIC_TRANSPORT").waitFor();
  await shot(p, "desktop-15-admin-readiness");
  await axe(p, "admin readiness");
  await ctx.close();
});
await step("SEO: robots disallows non-production; sitemap and manifest served", async () => {
  const robots = await (await fetch(`${WEB}/robots.txt`)).text();
  if (!/Disallow: \//.test(robots)) throw new Error("robots should disallow on non-production");
  const sm = await fetch(`${WEB}/sitemap.xml`); if (!sm.ok) throw new Error("sitemap");
  const mf = await fetch(`${WEB}/manifest.webmanifest`); if (!mf.ok) throw new Error("manifest");
  const priv = await fetch(`${WEB}/tai-khoan`, { redirect: "manual" }); if (![307, 308].includes(priv.status)) throw new Error("account should redirect when signed out");
});
await step("Security headers on web responses", async () => {
  const r = await fetch(WEB);
  for (const h of ["content-security-policy", "x-content-type-options", "referrer-policy", "x-frame-options", "permissions-policy"]) if (!r.headers.get(h)) throw new Error(`missing ${h}`);
});

await Promise.all(browsers.map((b) => b.close().catch(() => undefined)));
const summary = { webUrl: WEB, runAt: new Date().toISOString(), passed: results.filter((r) => r.status === "PASS").length, failed: results.filter((r) => r.status === "FAIL").length, results, consoleErrors, axe: axeFindings };
writeFileSync(new URL("e2e-results.json", OUT), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed} passed, ${summary.failed} failed, ${consoleErrors.length} console errors`);
process.exit(summary.failed ? 1 : 0);
