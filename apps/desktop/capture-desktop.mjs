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
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
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
