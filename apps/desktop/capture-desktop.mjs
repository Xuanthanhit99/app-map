import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const html = await readFile(resolve(here, "index.html"));
const out = resolve(here, "evidence", "desktop-v2-1536.png");
const server = createServer((_request, response) => {
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
    await page.screenshot({ path: out, fullPage: true, animations: "disabled" });
    console.log(`Desktop screenshot: ${out}`);
    console.log(`Viewport: 1536x1024, fullPage: true`);
  } finally { await browser.close(); }
} finally { server.close(); }
