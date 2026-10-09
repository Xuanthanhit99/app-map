import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const html = await readFile(resolve(here, "index.html"));
const out = resolve(here, "evidence", "desktop-v2-1536.png");
const server = createServer(async (request, response) => {
  if (request.url === "/state-engine.mjs" || request.url === "/desktop-map.mjs" || request.url === "/reality-client.mjs") {
    response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    response.end(await readFile(resolve(here, request.url.slice(1))));
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(html);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
try {
  await mkdir(dirname(out), { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
    const apiBase = process.env.DESKTOP_API_BASE_URL || "";
    const apiRequests = [];
    const apiResponses = [];
    page.on("request", (request) => { if (/\/v1\/(reality\/pulses|decision\/plans)$/.test(new URL(request.url()).pathname)) apiRequests.push(request.url()); });
    page.on("response", (response) => { if (/\/v1\/(reality\/pulses|decision\/plans)$/.test(new URL(response.url()).pathname)) apiResponses.push({ url: response.url(), status: response.status() }); });
    const pageUrl = new URL(`http://127.0.0.1:${server.address().port}/`);
    if (apiBase) pageUrl.searchParams.set("api", apiBase);
    await page.goto(pageUrl.toString(), { waitUntil: "load" });
    await page.waitForFunction(() => ["empty", "error", "ready"].includes(document.querySelector(".pulse-stack")?.dataset.collectionStatus) && ["empty", "error", "ready"].includes(document.querySelector(".plan-list")?.dataset.collectionStatus), null, { timeout: 12000 });
    const collectionStates = await page.evaluate(() => ({ reality: document.querySelector(".pulse-stack")?.dataset.collectionStatus, decision: document.querySelector(".plan-list")?.dataset.collectionStatus }));
    console.log("Desktop API states:", JSON.stringify(collectionStates));
    console.log("Desktop API requests:", JSON.stringify(apiRequests));
    console.log("Desktop API responses:", JSON.stringify(apiResponses));
    if (apiBase && (apiRequests.length !== 2 || apiResponses.length !== 2 || apiResponses.some((r) => r.status !== 200) || collectionStates.reality !== "empty" || collectionStates.decision !== "empty")) throw new Error("Desktop API empty-state integration gate failed");
    await page.waitForFunction(() => {
      const status = document.querySelector("[data-map-status]")?.textContent || "";
      return status.includes("Không tải") || status.includes("chưa khả dụng") || status.includes("Bản đồ nền ·");
    }, null, { timeout: 18000 }).catch(() => {});
    const mapStatus = await page.locator("[data-map-status]").textContent();
    console.log(`MapLibre state at capture: ${mapStatus}`);
    await page.screenshot({ path: out, fullPage: true, animations: "disabled" });
    console.log(`Desktop screenshot: ${out}`);
    console.log(`Viewport: 1536x1024, fullPage: true`);
  } finally { await browser.close(); }
} finally { server.close(); }
